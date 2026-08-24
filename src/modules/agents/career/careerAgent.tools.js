import { z } from "zod";
import { tool } from "@openai/agents";
import * as careerModel from "../../career/career.model.js";

/** @param {{ canAdd: boolean, canEdit: boolean, canDelete: boolean }} perms */
export function createCareerAgentTools({ canAdd, canEdit, canDelete }) {
  const listJobs = tool({
    name: "list_jobs",
    description: "List career jobs from admin. Use before update/close/delete if id is unknown.",
    parameters: z.object({
      limit: z.number().int().min(1).max(30).default(10),
      status: z.enum(["active", "inactive", "all"]).default("all"),
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
      "Create a new career job post. Call when user asks to create/post/open a job.",
    parameters: z.object({
      title: z.string().describe("Job title"),
      experience: z.number().int().min(0).max(30).default(2),
      positions: z.number().int().min(1).max(200).default(1),
      location: z.string().default("Noida"),
      qualification: z.string().default("Any bachelors degree"),
      salary: z.string().default("Best in the Industry"),
      skills: z.string().default(""),
      responsibilities: z.string().default(""),
      status: z.enum(["active", "inactive"]).default("active"),
    }),
    execute: async (params) => {
      if (!canAdd) {
        return {
          ok: false,
          error: "User does not have add permission for career.",
        };
      }
      try {
        const job = await careerModel.createJob(params);
        return {
          ok: true,
          id: job.id,
          title: job.title,
          status: job.status,
          location: job.location,
          message: "Job created successfully",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not create job" };
      }
    },
  });

  const updateJobPost = tool({
    name: "update_job_post",
    description:
      "Update an existing job by id. Use list_jobs first if user did not give id.",
    parameters: z.object({
      id: z.number().int().describe("Job id"),
      title: z.string(),
      experience: z.number().int().min(0).max(30).default(2),
      positions: z.number().int().min(1).max(200).default(1),
      location: z.string().default("Noida"),
      qualification: z.string().default("Any bachelors degree"),
      salary: z.string().default("Best in the Industry"),
      skills: z.string().default(""),
      responsibilities: z.string().default(""),
      status: z.enum(["active", "inactive"]).default("active"),
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
    description:
      "Mark a job inactive (close hiring). Prefer this over delete.",
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
    description:
      "Delete a job by id. May deactivate instead if applications exist.",
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

  return [listJobs, createJobPost, updateJobPost, closeJobPost, deleteJobPost];
}
