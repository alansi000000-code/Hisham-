declare module "react-native-tesseract-ocr" {
  export const LANG_ARABIC: string;
  export const LANG_ENGLISH: string;
  export const LEVEL_WORD: string;
  export function useEventListener(
    eventType: string,
    listener: (payload: { percent: number }) => void,
  ): void;
  const TesseractOcr: {
    recognize(
      imageSource: string,
      language: string,
      options?: Record<string, string>,
    ): Promise<string>;
    stop(): Promise<string>;
  };
  export default TesseractOcr;
}
