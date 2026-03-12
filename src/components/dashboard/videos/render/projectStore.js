/**
 * Lightweight project persistence via localStorage.
 *
 * Stores reel project drafts as JSON. Video files are not persisted
 * (only metadata, text, and settings). Max 10 recent projects.
 */

const STORAGE_KEY = 'maximus_reel_projects';
const MAX_PROJECTS = 10;

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, MAX_PROJECTS)));
  } catch {
    // storage full or unavailable
  }
}

export function saveProject(data) {
  const projects = readStore();
  const project = {
    id: data.id || `proj_${Date.now()}`,
    savedAt: new Date().toISOString(),
    name: data.projectName || 'Untitled',
    promptContext: data.promptContext || '',
    featureType: data.featureType || 'generalDemo',
    hookStyle: data.hookStyle || 'product',
    messageAngle: data.messageAngle || 'demo',
    copyIntensity: data.copyIntensity || 'balanced',
    captionTone: data.captionTone || 'instagram',
    headline: data.headline || '',
    subhead: data.subhead || '',
    overlayBeats: data.overlayBeats || ['', '', ''],
    cta: data.cta || '',
    ctaType: data.ctaType || 'website',
    caption: data.caption || '',
    trimStart: data.trimStart ?? 0,
    trimEnd: data.trimEnd ?? 10,
    editMode: data.editMode || 'smart',
    watermark: data.watermark ?? true,
    templateId: data.templateId || 'feature-spotlight',
    sourceFileName: data.sourceFileName || null,
    videoDuration: data.videoDuration || 0,
  };

  const existing = projects.findIndex(p => p.id === project.id);
  if (existing >= 0) {
    projects[existing] = project;
  } else {
    projects.unshift(project);
  }

  writeStore(projects);
  return project;
}

export function loadProject(id) {
  const projects = readStore();
  return projects.find(p => p.id === id) || null;
}

export function loadLastProject() {
  const projects = readStore();
  return projects.length > 0 ? projects[0] : null;
}

export function listProjects() {
  return readStore();
}

export function deleteProject(id) {
  const projects = readStore().filter(p => p.id !== id);
  writeStore(projects);
}
