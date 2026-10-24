/** 같은 PDF의 각 페이지를 흰 배경 PNG로 변환하며 페이지별로 캔버스를 해제해 긴 보고서의 메모리 사용을 줄입니다. */
export async function createReportImages(blob: Blob, signal: AbortSignal): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist');
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({
    data: await blob.arrayBuffer()
  });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, {
    once: true
  });
  try {
    signal.throwIfAborted();
    const document = await task.promise;
    const images: Blob[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      signal.throwIfAborted();
      const page = await document.getPage(index);
      const viewport = page.getViewport({
        scale: 2
      });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({
          canvas,
          viewport,
          background: 'white'
        }).promise;
        signal.throwIfAborted();
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG_UNAVAILABLE')), 'image/png'));
        images.push(png);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
    signal.throwIfAborted();
    return images;
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}

/** 한 페이지는 PNG로 저장하고 여러 페이지는 하나의 ZIP에 모두 담아 브라우저의 연속 다운로드 차단을 피합니다. */
export async function createReportImageDownload(images: readonly Blob[], filename: string): Promise<{ blob: Blob; extension: string }> {
  if (!images.length) throw new Error('PNG_UNAVAILABLE');
  if (images.length === 1) return {
    blob: images[0],
    extension: 'png'
  };
  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  for (const [index, image] of images.entries()) files[`${filename}_${String(index + 1).padStart(2, '0')}.png`] = new Uint8Array(await image.arrayBuffer());
  return {
    blob: new Blob([zipSync(files, {
      level: 0
    })], {
      type: 'application/zip'
    }),
    extension: 'zip'
  };
}
