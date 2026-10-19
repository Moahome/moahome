import { useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  commitResidents,
  getImportError,
  previewResidents
} from '../../api/residentImportApi';
import type { ImportResult } from '../../api/residentImportApiTypes';

/** 파일과 명부를 브라우저 저장소에 남기지 않고 업로드·선택·저장 결과의 수명과 중복 클릭을 관리합니다. */
export function useResidentImport(propertyId: string) {
  const client = useQueryClient();
  const active = useRef(true);
  const locked = useRef(false);
  const notificationId = useRef(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  /** 같은 오류를 반복해도 새 토스트의 표시 시간이 시작되도록 알림마다 식별자를 갱신합니다. */
  function notifyError(message: string) {
    notificationId.current += 1;
    setError({
      id: notificationId.current,
      message
    });
  }

  /** 클라이언트에서 크기를 먼저 확인하고 최종 파일 형식·행 검증은 서버에서 수행합니다. */
  async function upload(file: File) {
    if (locked.current) return;
    if (!file.name.toLowerCase().endsWith('.xlsx') || !file.size || file.size > 5 * 1024 * 1024) {
      notifyError('5MB 이하의 .xlsx 파일을 선택해주세요.');
      return;
    }
    locked.current = true;
    setBusy('upload')
    setError(null);
    try {
      const next = await previewResidents(propertyId, file);
      if (!active.current) return;
      setResult(next);
      setSelected(next.rows.filter((row) => row.status === 'READY').map((row) => row.rowNumber));
      setFilename(file.name)
      setAttempted(false)
      setCompleted(false);
    } catch (failure) {
      if (active.current) notifyError(getImportError(failure));
    } finally {
      locked.current = false;
      if (active.current) setBusy(null);
    }
  }

  /** 응답 유실 후에도 검증 ID와 선택을 바꾸지 않고 재시도해 이미 저장된 행의 결과를 복구합니다. */
  async function save() {
    if (locked.current || !result || !selected.length || completed) return;
    locked.current = true
    setBusy('save')
    setError(null)
    setAttempted(true);
    try {
      const next = await commitResidents(propertyId, result.importId, selected);
      if (!active.current) return;
      setResult(next)
      setCompleted(true);
      void client.invalidateQueries({
        predicate: (query) => ['property-residents', 'property-units'].includes(String(query.queryKey[0]))
      });
    } catch (failure) {
      if (active.current) notifyError(getImportError(failure));
    } finally {
      locked.current = false;
      if (active.current) setBusy(null);
    }
  }

  function reset() {
    if (locked.current) return;
    setResult(null)
    setSelected([])
    setFilename('')
    setError(null)
    setAttempted(false)
    setCompleted(false);
  }

  return {
    result,
    selected,
    setSelected,
    filename,
    busy,
    error,
    dismissError: () => setError(null),
    attempted,
    completed,
    upload,
    save,
    reset
  };
}
