// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getBrandNodeByProject, listBrandFields, upsertBrandField } from './db.js';

const execFile = promisify(execFileCb);

const VALID_PIPELINES = new Set(['local', 'cloud', 'ask']);

// ------------------------------------------------------------------ read/write preference

export function getAnimationPipeline(db, projectId) {
  const node = getBrandNodeByProject(db, projectId);
  if (!node) return 'ask';
  const fields = listBrandFields(db, node.id);
  const pref = fields.find((f) => f.section === 'motion' && f.key === 'animation.pipeline');
  return VALID_PIPELINES.has(pref?.value) ? pref.value : 'ask';
}

export function setAnimationPipeline(db, projectId, pipeline) {
  if (!VALID_PIPELINES.has(pipeline)) return;
  const node = getBrandNodeByProject(db, projectId);
  if (!node) return;
  const now = Date.now();
  upsertBrandField(db, {
    id: randomUUID(),
    nodeId: node.id,
    section: 'motion',
    key: 'animation.pipeline',
    value: pipeline,
    confidence: 1.0,
    source: 'user',
    locked: 0,
    lockCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

// ------------------------------------------------------------------ brand context for cloud prompts

export function getBrandPromptContext(db, projectId) {
  const node = getBrandNodeByProject(db, projectId);
  if (!node) return '';
  const fields = listBrandFields(db, node.id);
  const parts = [];

  const primaryColor = fields.find(
    (f) => f.section === 'colors' && /primary|brand|accent/i.test(f.key) && f.confidence >= 0.5,
  );
  if (primaryColor) parts.push(`Color palette: ${primaryColor.value}`);

  const atmosphere = fields.find((f) => f.section === 'atmosphere' && f.confidence >= 0.5);
  if (atmosphere) parts.push(`Style: ${atmosphere.value}`);

  const voice = fields.find(
    (f) => f.section === 'voice' && /tone|mood|atmosphere/i.test(f.key) && f.confidence >= 0.5,
  );
  if (voice) parts.push(`Mood: ${voice.value}`);

  return parts.join('. ');
}

// ------------------------------------------------------------------ local pipeline

async function which(cmd) {
  try {
    await execFile(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

export async function checkLocalPipelineAvailable(scriptRoot) {
  const renderScript = path.join(scriptRoot, 'render-video.js');
  try {
    await access(renderScript);
  } catch {
    return { ok: false, reason: 'render-video.js not found in huashu-scripts' };
  }
  const hasFfmpeg = await which('ffmpeg');
  if (!hasFfmpeg) {
    return { ok: false, reason: 'ffmpeg not found — install ffmpeg to use local pipeline' };
  }
  return { ok: true };
}

export async function runLocalPipeline(options) {
  const { scriptRoot, htmlFile, outputDir, onProgress } = options;

  const renderScript = path.join(scriptRoot, 'render-video.js');
  const convertScript = path.join(scriptRoot, 'convert-formats.sh');
  const addMusicScript = path.join(scriptRoot, 'add-music.sh');

  const mp4Out = path.join(outputDir, 'video.mp4');

  onProgress?.('[local] Rendering HTML → MP4 via headless browser…');
  await execFile('node', [renderScript, htmlFile, mp4Out], { timeout: 120_000 });
  onProgress?.('[local] MP4 rendered.');

  try {
    await access(convertScript);
    onProgress?.('[local] Converting formats (60fps + GIF)…');
    await execFile('bash', [convertScript, mp4Out], { timeout: 60_000 });
    onProgress?.('[local] Formats converted.');
  } catch {
    // convert-formats.sh is optional
  }

  try {
    await access(addMusicScript);
    onProgress?.('[local] Adding audio…');
    await execFile('bash', [addMusicScript, mp4Out], { timeout: 60_000 });
    onProgress?.('[local] Audio added.');
  } catch {
    // add-music.sh is optional
  }

  return { file: mp4Out, mime: 'video/mp4', size: 0 };
}
