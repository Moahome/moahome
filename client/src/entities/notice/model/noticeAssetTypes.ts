export type NoticeAsset = { id: string; name: string; size: number; data: string };
export type NoticeAssetReader = (reference: string, signal?: AbortSignal) => Promise<Blob>;
export type NoticeAssetUploader = (file: File, image: boolean) => Promise<NoticeAsset>;
