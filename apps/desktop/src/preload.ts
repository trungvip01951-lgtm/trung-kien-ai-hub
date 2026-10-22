import { contextBridge, ipcRenderer } from "electron";
import type { HubApi, HubEvent } from "./shared/contract";

const call = (ch: string) => (...args: unknown[]) => ipcRenderer.invoke(ch, ...args);

const api: HubApi = {
  appVersion: call("appVersion") as HubApi["appVersion"],
  hasApiKey: call("hasApiKey") as HubApi["hasApiKey"],
  listApiKeys: call("listApiKeys") as HubApi["listApiKeys"],
  addApiKey: call("addApiKey") as HubApi["addApiKey"],
  removeApiKey: call("removeApiKey") as HubApi["removeApiKey"],
  moveApiKey: call("moveApiKey") as HubApi["moveApiKey"],
  testApiKey: call("testApiKey") as HubApi["testApiKey"],
  getSettings: call("getSettings") as HubApi["getSettings"],
  saveSettings: call("saveSettings") as HubApi["saveSettings"],
  usageSummary: call("usageSummary") as HubApi["usageSummary"],
  listTasks: call("listTasks") as HubApi["listTasks"],
  listProjects: call("listProjects") as HubApi["listProjects"],
  addProject: call("addProject") as HubApi["addProject"],
  addProjectPath: call("addProjectPath") as HubApi["addProjectPath"],
  saveProjectInstructions: call("saveProjectInstructions") as HubApi["saveProjectInstructions"],
  readProjectFile: call("readProjectFile") as HubApi["readProjectFile"],
  scanFolder: call("scanFolder") as HubApi["scanFolder"],
  lastInventory: call("lastInventory") as HubApi["lastInventory"],
  listOldSessions: call("listOldSessions") as HubApi["listOldSessions"],
  importOldSession: call("importOldSession") as HubApi["importOldSession"],
  listSkills: call("listSkills") as HubApi["listSkills"],
  previewSkillUpload: call("previewSkillUpload") as HubApi["previewSkillUpload"],
  commitSkillUpload: call("commitSkillUpload") as HubApi["commitSkillUpload"],
  cancelSkillUpload: call("cancelSkillUpload") as HubApi["cancelSkillUpload"],
  setSkillEnabled: call("setSkillEnabled") as HubApi["setSkillEnabled"],
  removeSkill: call("removeSkill") as HubApi["removeSkill"],
  restoreSkill: call("restoreSkill") as HubApi["restoreSkill"],
  openBrowserProfile: call("openBrowserProfile") as HubApi["openBrowserProfile"],
  listConversations: call("listConversations") as HubApi["listConversations"],
  conversationItems: call("conversationItems") as HubApi["conversationItems"],
  search: call("search") as HubApi["search"],
  startTask: call("startTask") as HubApi["startTask"],
  stopTask: call("stopTask") as HubApi["stopTask"],
  answerPermission: call("answerPermission") as HubApi["answerPermission"],
  runningTaskId: call("runningTaskId") as HubApi["runningTaskId"],
  checkUpdate: call("checkUpdate") as HubApi["checkUpdate"],
  installUpdate: call("installUpdate") as HubApi["installUpdate"],
  onEvent(cb) {
    const h = (_e: unknown, ev: HubEvent) => cb(ev);
    ipcRenderer.on("hub-event", h);
    return () => ipcRenderer.removeListener("hub-event", h);
  },
};

contextBridge.exposeInMainWorld("hub", api);
