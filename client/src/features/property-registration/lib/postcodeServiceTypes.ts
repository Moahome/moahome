export interface PostcodeResult {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: 'R' | 'J';
}

export interface PostcodeOptions {
  oncomplete: (data: PostcodeResult) => void;
  width: string;
  height: string;
}

export interface PostcodeService {
  Postcode: new (options: PostcodeOptions) => {
    embed: (element: HTMLElement) => void;
  };
}
