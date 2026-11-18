import * as approvalModel from "./careerApproval.model.js";
import * as topicModel from "./careerAutomations.model.js";
import {
  runScheduleGateTick,
  sendTestScheduleGateEmail,
  shouldRunCareerSchedule,
} from "./careerApproval.schedule.service.js";
import { getPublicApiBase } from "./careerApproval.email.js";

export { sendTestScheduleGateEmail, shouldRunCareerSchedule };

export async function getAutomationsDashboard() {
  await topicModel.ensureCareerAutomationTopicsTable();
  const settings = await approvalModel.getSettings();
  const topics = await topicModel.listTopics();
  return {
    settings,
    topics,
    publicApiConfigured: Boolean(getPublicApiBase()),
    publicApiBase: getPublicApiBase() || null,
  };
}

export async function saveAutomationsSettings(payload, updatedBy) {
  return approvalModel.saveSettings(payload, updatedBy);
}

export async function runCareerAutomationTick() {
  const settings = await approvalModel.getSettings();
  if (!shouldRunCareerSchedule(settings)) {
    return { ran: false, reason: "not_due" };
  }
  return runScheduleGateTick({ force: false });
}

export async function runCareerAutomationNow() {
  return runScheduleGateTick({ force: true });
}
