import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

export type OcrResult = {
  text: string;
  engine: string;
};

/**
 * Android builds use the local Tesseract bridge with the bundled Arabic model.
 * The browser preview intentionally uses a local fixture so the full review/export
 * workflow can be demonstrated without pretending that browser OCR is offline Arabic OCR.
 */
export async function recognizeLocalText(uri: string, previewName = "صورة إشعار") : Promise<OcrResult> {
  if (Platform.OS === "web") {
    const { DEMO_OCR_TEXT } = await import("@/lib/notification-parser");
    return { text: DEMO_OCR_TEXT, engine: `معاينة محلية — ${previewName}` };
  }

  try {
    // Samsung galleries commonly return very large 12–50 MP images. Keep the
    // native OCR bitmap bounded so the Android process cannot be killed by a
    // native allocation before JavaScript can show an error.
    const prepared = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 2200 } }],
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TesseractOcr = require("react-native-tesseract-ocr").default as {
      recognize: (imageUri: string, language: string, options: Record<string, string>) => Promise<string>;
    };
    if (!TesseractOcr?.recognize) {
      throw new Error("محرك OCR غير متاح في هذا البناء");
    }
    const text = await TesseractOcr.recognize(prepared.uri, "ara", {
      // Keep punctuation and Latin digits used by transfer references.
      allowlist: "0123456789٠١٢٣٤٥٦٧٨٩ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويءآأإةىئـ:.-_/،, ريال",
    });
    return { text: text?.trim() ?? "", engine: "OCR عربي محلي — معالجة آمنة للصورة" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تشغيل محرك OCR";
    throw new Error(message);
  }
}
