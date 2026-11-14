import type { NoticeDraft } from './noticeTypes';
export type {
  NoticeDraft
} from './noticeTypes';


const DATABASE = 'moahome-notice-drafts';
const STORE = 'drafts';
export const DRAFT_REMOVED_EVENT = 'moahome-notice-draft-removed';

/** 제목·실제 본문·이미지 중 하나라도 있어야 초안 저장과 복구 확인을 제공합니다. */
export function hasNoticeDraftContent(draft: Pick<NoticeDraft, 'title' | 'content'>): boolean {
  if (draft.title.trim()) return true;
  try {
    const visit = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      const item = node as { type?: string; text?: string; attrs?: { src?: string }; content?: unknown[] };
      if (item.type === 'text' && typeof item.text === 'string' && item.text.trim()) return true;
      if (item.type === 'image' && typeof item.attrs?.src === 'string' && item.attrs.src) return true;
      return Array.isArray(item.content) && item.content.some(visit);
    };

    const document = JSON.parse(draft.content);
    return (Array.isArray(document.files) && document.files.length > 0) || visit(document);
  } catch {
    return false;
  }
}

/** 계정·관리대상·글별 초안을 분리하며 이미지가 있는 본문도 IndexedDB 트랜잭션으로 보관합니다. */
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, {
      keyPath: 'key'
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('DRAFT_STORE_BLOCKED'));
  });
}

/** 이전 버전의 여러 저장본이 있으면 해당 화면에서 가장 최근의 한 건만 복구 후보로 사용합니다. */
export async function readNoticeDraft(key: string): Promise<NoticeDraft | null> {
  const drafts = await listNoticeDrafts(key);
  return drafts[0] ?? null;
}

export async function saveNoticeDraft(draft: NoticeDraft) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.delete(IDBKeyRange.bound(`${draft.key}:saved:`, `${draft.key}:saved:\uffff`));
      store.put(draft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

/** 게시 성공을 먼저 알려 대기 중 자동 저장이 삭제한 초안을 다시 만들지 못하게 합니다. */
export async function removeNoticeDraft(key: string) {
  window.dispatchEvent(new CustomEvent(DRAFT_REMOVED_EVENT, {
    detail: key
  }));
  await clearNoticeDrafts(key);
}

/** 복구 확인·취소 모두 해당 화면의 초안을 소비합니다. 다른 글·새 글의 초안은 건드리지 않습니다. */
export async function clearNoticeDrafts(key: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.delete(key);
      // 여러 건을 남기던 이전 구현의 수동 저장본도 같은 화면에 한해서 제거합니다.
      store.delete(IDBKeyRange.bound(`${key}:saved:`, `${key}:saved:\uffff`));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

/** 화면별 한 건만 제공하며 기존 중복 저장본은 가장 최근 내용으로 통합해 읽습니다. */
export async function listNoticeDrafts(key: string): Promise<NoticeDraft[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const current = store.get(key);
      const legacy = store.getAll(IDBKeyRange.bound(`${key}:saved:`, `${key}:saved:\uffff`));
      transaction.oncomplete = () => {
        const candidates = [current.result, ...legacy.result].filter((draft): draft is NoticeDraft => Boolean(draft) && hasNoticeDraftContent(draft));
        candidates.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        resolve(candidates.length ? [{
          ...candidates[0],
          key
        }] : []);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

/** 속성 순서와 편집기 기본값을 정규화해 화면에 영향을 주는 제목·본문·서식·파일만 비교합니다. */
export function getNoticeDraftSignature(draft: Pick<NoticeDraft, 'title' | 'content' | 'important'>): string {
  let content = draft.content;
  try {
    content = JSON.stringify(normalizeDocument(JSON.parse(content)));
  } catch { /* 잘못된 본문은 그대로 비교하고 저장 API의 검증을 받습니다. */ }
  return JSON.stringify([draft.title, content, draft.important]);
}

/** 문서 객체의 키 순서는 무시하되 문단·이미지·파일 순서와 실제로 지정한 서식은 보존합니다. */
function normalizeDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDocument);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) {
    const original = object[key];
    if (original === null || original === undefined) continue;
    if (key === 'attrs' && original && typeof original === 'object') {
      const attributes = {
        ...original
      } as Record<string, unknown>;
      if (attributes.textAlign === 'left') delete attributes.textAlign;
      if (object.type === 'orderedList' && attributes.start === 1) delete attributes.start;
      if (object.type === 'heading' && attributes.level === 1) delete attributes.level;
      if (object.type === 'textStyle' && attributes.fontSize === '16px') delete attributes.fontSize;
      const normalized = normalizeDocument(attributes) as Record<string, unknown>;
      if (Object.keys(normalized).length) result[key] = normalized;
      continue;
    }
    let normalized = normalizeDocument(original);
    if (key === 'marks' && Array.isArray(normalized)) {
      const marks = normalized.filter((mark) => mark.type !== 'textStyle' || mark.attrs);
      marks.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      normalized = marks;
    }
    if (Array.isArray(normalized) && !normalized.length && ['files', 'content', 'marks'].includes(key)) continue;
    result[key] = normalized;
  }
  return result;
}
