import { z } from "zod";
import { tool } from "@openai/agents";
import * as careerModel from "../../career/career.model.js";
import * as approvalModel from "./careerApproval.model.js";
import * as approvalService from "./careerApproval.service.js";

/** @param {{ canAdd: boolean, canEdit: boolean, canDelete: boolean, userEmail?: string, userId?: string }} ctx */
export function createCareerAgentTools(ctx) {
  const { canAdd, canEdit, canDelete, userEmail, userId } = ctx;

  const listJobs = tool({
    name: "list_jobs",
    description: "List career jobs from admin. Use before update/close/delete if id is unknown.",
    parameters: z.object({
      limit: z.number().int().min(1).max(30).default(10),
      status: z
        .enum(["active", "inactive", "pending_approval", "rejected", "all"])
        .default("all"),
      search: z.string().nullable().default(null),
    }),
    execute: async ({ limit, status, search }) => {
      try {
        let list = await careerModel.getAllJobs();
        if (status !== "all") {
          list = list.filter((j) => j.status === status);
        }
        if (search) {
          const q = String(search).toLowerCase();
          list = list.filter(
            (j) =>
              String(j.title || "").toLowerCase().includes(q) ||
              String(j.location || "").toLowerCase().includes(q),
          );
        }
        return {
          ok: true,
          count: Math.min(limit, list.length),
          jobs: list.slice(0, limit).map((j) => ({
            id: j.id,
            title: j.title,
            location: j.location,
            experience: j.experience,
            positions: j.positions,
            status: j.status,
            applications: j.application_count || 0,
          })),
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not list jobs" };
      }
    },
  });

  const createJobPost = tool({
    name: "create_job_post",
    description:
      "Create a career job. When HR approval is enabled, job is saved as pending_approval and HR is emailed Yes/No publish links. Only use status active if user explicitly wants to skip approval AND settings allow it.",
    parameters: z.object({
      title: z.string().describe("Job title"),
      experience: z
        .string()
        .describe('Work experience text shown on site, e.g. "8+ Years", "2-5 Years"'),
      positions: z.number().int().min(1).max(200).default(1),
      location: z.string().default("Noida"),
      qualification: z.string().default("Any bachelors degree"),
      salary: z.string().default("Best in the Industry"),
      skills: z
        .string()
        .describe(
          "Required skills/experience — full text, bullet points allowed. Maps to Required Skills on career page.",
        ),
      responsibilities: z
        .string()
        .describe(
          "Job responsibilities and full JD details — bullet points allowed. Maps to Job Responsibilities on career page.",
        ),
      status: z
        .enum(["active", "inactive", "pending_approval"])
        .default("pending_approval"),
      notify_hr: z
        .boolean()
        .default(true)
        .describe("If true, email HR asking Yes/No to publish (when approval settings enabled)"),
    }),
    execute: async (params) => {
      if (!canAdd) {
        return {
          ok: false,
          error: "User does not have add permission for career.",
        };
      }
      if (!String(params.skills || "").trim()) {
        return { ok: false, error: "skills field is required — add required skills/JD" };
      }
      if (!String(params.responsibilities || "").trim()) {
        return {
          ok: false,
          error: "responsibilities field is required — add job responsibilities/JD",
        };
      }
      try {
        const settings = await approvalModel.getSettings();
        const forcePending =
          settings.enabled &&
          settings.require_hr_approval &&
          params.notify_hr !== false;

        let createStatus = params.status || "active";
        if (forcePending) {
          createStatus = "pending_approval";
        } else if (createStatus === "pending_approval") {
          createStatus = "active";
        }

        const job = await careerModel.createJob({
          ...params,
          status: createStatus,
        });

        let approval = null;
        if (forcePending) {
          try {
            approval = await approvalService.requestHrPublishApproval({
              job,
              requestedBy: userId || "career-agent",
              requesterEmail: userEmail || null,
            });
          } catch (err) {
            return {
              ok: true,
              id: job.id,
              title: job.title,
              status: job.status,
              location: job.location,
              experience: job.experience,
              skills_length: String(job.skills || "").length,
              responsibilities_length: String(job.responsibilities || "").length,
              approval_error: err.message,
              message:
                "Job saved as pending_approval, but HR email failed. Fix settings and resend approval.",
            };
          }
        }

        return {
          ok: true,
          id: job.id,
          title: job.title,
          status: forcePending ? "pending_approval" : job.status,
          location: job.location,
          experience: job.experience,
          skills_length: String(job.skills || "").length,
          responsibilities_length: String(job.responsibilities || "").length,
          hr_notified: Boolean(approval && !approval.skipped),
          hr_recipients: approval?.recipients || [],
          approval_skipped: approval?.skipped || false,
          approval_skip_reason: approval?.reason || null,
          message: forcePending
            ? "Job created as pending_approval. HR was emailed to Yes/No publish. It is NOT live until HR approves."
            : "Job created successfully",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not create job" };
      }
    },
  });

  const requestPublishApproval = tool({
    name: "request_publish_approval",
    description:
      "Email HR asking whether to publish an existing job (Yes/No secure links). Use for pending jobs or to resend.",
    parameters: z.object({
      id: z.number().int().describe("Job id"),
    }),
    execute: async ({ id }) => {
      if (!canEdit && !canAdd) {
        return { ok: false, error: "No permission to request HR approval" };
      }
      try {
        const result = await approvalService.resendApprovalForJob(id, {
          id: userId,
          email: userEmail,
        });
        if (result.skipped) {
          return {
            ok: true,
            skipped: true,
            reason: result.reason,
            message: "HR approval flow is disabled in settings",
          };
        }
        return {
          ok: true,
          jobId: result.jobId,
          status: result.status,
          recipients: result.recipients,
          message: "HR emailed with Yes/No publish links",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not email HR" };
      }
    },
  });

  const checkApprovalStatus = tool({
    name: "check_job_approval_status",
    description: "Check whether a job is pending HR approval, approved/published, or rejected.",
    parameters: z.object({
      id: z.number().int().describe("Job id"),
    }),
    execute: async ({ id }) => {
      try {
        const job = await careerModel.getJobByIdAdmin(id);
        if (!job) return { ok: false, error: "Job not found" };
        const pending = await approvalModel.getLatestPendingForJob(id);
        return {
          ok: true,
          id: job.id,
          title: job.title,
          job_status: job.status,
          pending_approval: Boolean(pending),
          approval_decision: pending?.decision || null,
          expires_at: pending?.expires_at || null,
          reminder_count: pending?.reminder_count || 0,
          behavior_hint:
            job.status === "active"
              ? "Already published — live on careers page"
              : job.status === "pending_approval"
                ? "Waiting for HR Yes/No email decision"
                : job.status === "rejected"
                  ? "HR said No / request expired — not published"
                  : "Inactive / closed",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not check status" };
      }
    },
  });

  const updateJobPost = tool({
    name: "update_job_post",
    description:
      "Update an existing job by id. Include full skills and responsibilities when updating JD.",
    parameters: z.object({
      id: z.number().int().describe("Job id"),
      title: z.string(),
      experience: z.string().default("2+ Years"),
      positions: z.number().int().min(1).max(200).default(1),
      location: z.string().default("Noida"),
      qualification: z.string().default("Any bachelors degree"),
      salary: z.string().default("Best in the Industry"),
      skills: z.string(),
      responsibilities: z.string(),
      status: z
        .enum(["active", "inactive", "pending_approval", "rejected"])
        .default("pending_approval"),
    }),
    execute: async ({ id, ...payload }) => {
      if (!canEdit) {
        return {
          ok: false,
          error: "User does not have edit permission for career.",
        };
      }
      try {
        const updated = await careerModel.updateJob(id, payload);
        if (!updated) return { ok: false, error: "Job not found" };
        return {
          ok: true,
          id: updated.id,
          title: updated.title,
          status: updated.status,
          message: "Job updated successfully",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not update job" };
      }
    },
  });

  const closeJobPost = tool({
    name: "close_job_post",
    description: "Mark a job inactive (close hiring). Prefer this over delete.",
    parameters: z.object({
      id: z.number().int().describe("Job id"),
    }),
    execute: async ({ id }) => {
      if (!canEdit) {
        return {
          ok: false,
          error: "User does not have edit permission for career.",
        };
      }
      try {
        const existing = await careerModel.getJobByIdAdmin(id);
        if (!existing) return { ok: false, error: "Job not found" };
        const updated = await careerModel.updateJob(id, {
          title: existing.title,
          experience: existing.experience,
          positions: existing.positions,
          location: existing.location,
          qualification: existing.qualification,
          salary: existing.salary,
          skills: existing.skills,
          responsibilities: existing.responsibilities,
          status: "inactive",
        });
        return {
          ok: true,
          id: updated.id,
          title: updated.title,
          status: updated.status,
          message: "Job closed (inactive)",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not close job" };
      }
    },
  });

  const deleteJobPost = tool({
    name: "delete_job_post",
    description: "Delete a job by id. May deactivate instead if applications exist.",
    parameters: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      if (!canDelete) {
        return {
          ok: false,
          error: "User does not have delete permission for career.",
        };
      }
      try {
        const result = await careerModel.deleteJob(id);
        if (!result) return { ok: false, error: "Job not found" };
        return { ok: true, id, ...result };
      } catch (err) {
        return { ok: false, error: err.message || "Could not delete job" };
      }
    },
  });

  return [
    listJobs,
    createJobPost,
    requestPublishApproval,
    checkApprovalStatus,
    updateJobPost,
    closeJobPost,
    deleteJobPost,
  ];
}
