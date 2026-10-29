const fs = require("fs");
const path = require("path");

const gradlePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-tesseract-ocr",
  "android",
  "build.gradle",
);
const javaPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-tesseract-ocr",
  "android",
  "src",
  "main",
  "java",
  "com",
  "reactlibrary",
  "TesseractOcrModule.java",
);

if (!fs.existsSync(gradlePath)) {
  process.exit(0);
}

let gradle = fs.readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/compileSdk(?:Version)?\s+(?:=\s*)?.*/, "compileSdk = 36");
gradle = gradle.replace(/buildToolsVersion\s+safeExtGet\([^\n]+\)/, "");
gradle = gradle.replace(/minSdkVersion\s+safeExtGet\([^\n]+\)/, "minSdk = 24");
gradle = gradle.replace(/targetSdkVersion\s+safeExtGet\([^\n]+\)/, "targetSdk = 36");
gradle = gradle.replace(/\s*apply plugin: 'maven'\s*/g, "\n");
gradle = gradle.replace(/\s*jcenter\(\)\s*/g, "\n");
gradle = gradle.replace(/\s*classpath \+= files\(project\.getConfigurations\(\)\.getByName\('compile'\)\.asList\(\)\)/g, "");
gradle = gradle.replace(/classifier\s*=\s*'javadoc'/g, "archiveClassifier = 'javadoc'");
	gradle = gradle.replace(/classifier\s*=\s*'sources'/g, "archiveClassifier = 'sources'");
	gradle = gradle.replace(/implementation\s+'com\.rmtheis:tess-two:[^']+'/g, "implementation 'cz.adaptech.tesseract4android:tesseract4android:4.9.0'");
	if (!gradle.includes("https://jitpack.io")) gradle = gradle.replace("    google()", "    google()\n    maven { url 'https://jitpack.io' }");
gradle = gradle.replace(/\nafterEvaluate \{ project ->[\s\S]*?\n\}\s*$/, "\n");
if (!gradle.includes("namespace \"com.reactlibrary\"")) {
  gradle = gradle.replace("android {", "android {\n    namespace \"com.reactlibrary\"");
}
fs.writeFileSync(gradlePath, gradle);

if (fs.existsSync(javaPath)) {
  let java = fs.readFileSync(javaPath, "utf8");
  java = java.replace(
    'private static String DATA_PATH = Environment.getExternalStorageDirectory().toString();',
    'private String DATA_PATH;'
  );
  java = java.replace('private static String TESS_FILES_PATH;', 'private String TESS_FILES_PATH;');
  java = java.replace(
    `        if (!this.DATA_PATH.contains(reactContext.getPackageName())) {
            this.DATA_PATH += File.separator + reactContext.getPackageName();
        }
        this.TESS_FILES_PATH = this.DATA_PATH + File.separator + this.TESS_FILES_DIRECTORY;`,
    `        this.DATA_PATH = reactContext.getFilesDir().getAbsolutePath();
        this.TESS_FILES_PATH = this.DATA_PATH + File.separator + this.TESS_FILES_DIRECTORY;`,
  );
  if (!java.includes('promise.reject("TESSERACT_INIT_FAILED"')) {
    java = java.replace(
      '            tesseract = createTesseractAPI(lang, tessOptions);',
      '            tesseract = createTesseractAPI(lang, tessOptions);\n                        if (!tesseract.init(DATA_PATH + File.separator, lang)) {\n                            promise.reject("TESSERACT_INIT_FAILED", "تعذر تهيئة نموذج OCR العربي");\n                            return;\n                        }',
    );
  }
  java = java.replace(
    '        tessBaseAPI.init(DATA_PATH + File.separator, lang);',
    '        // Initialization is validated by recognize() before image processing.',
  );
  java = java.replace(/\.end\(\)/g, ".recycle()");
  if (!java.includes("TESSERACT_RECOGNITION_FAILED")) {
    java = java.replace(
      /                        tesseract\.setImage\(bitmap\);[\s\S]*?                        promise\.resolve\(recognizedText\);/,
      `                        try {
                            tesseract.setImage(bitmap);
                            String recognizedText = tesseract.getUTF8Text();
                            tesseract.clear();
                            tesseract.end();
                            bitmap.recycle();
                            promise.resolve(recognizedText);
                        } catch (Throwable recognitionError) {
                            try { if (tesseract != null) tesseract.end(); } catch (Throwable ignored) { }
                            try { if (!bitmap.isRecycled()) bitmap.recycle(); } catch (Throwable ignored) { }
                            promise.reject("TESSERACT_RECOGNITION_FAILED", "تعذر قراءة الصورة بمحرك OCR المحلي");
                        }`,
    );
  }
  java = java.replace(
    /    private Bitmap getBitmap\(String imageSource\) throws Exception \{[\s\S]*?\n    \}/,
    `    private Bitmap getBitmap(String imageSource) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        if (imageSource.startsWith("content://")) {
            InputStream input = reactContext.getContentResolver().openInputStream(android.net.Uri.parse(imageSource));
            if (input == null) return null;
            try {
                BitmapFactory.decodeStream(input, null, bounds);
            } finally {
                input.close();
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight);
            input = reactContext.getContentResolver().openInputStream(android.net.Uri.parse(imageSource));
            if (input == null) return null;
            try { return BitmapFactory.decodeStream(input, null, options); } finally { input.close(); }
        }

        String path = imageSource.startsWith("file://") ? imageSource.replace("file://", "") : imageSource;
        if (path.startsWith("http://") || path.startsWith("https://")) {
            throw new Exception("Cannot select remote files");
        }
        BitmapFactory.decodeFile(path, bounds);
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight);
        return BitmapFactory.decodeFile(path, options);
    }`,
  );
  if (!java.includes("private int calculateSampleSize")) {
    java = java.replace(
      /\n}\s*$/,
      "\n    private int calculateSampleSize(int width, int height) {\n        int sample = 1;\n        while (Math.max(width / sample, height / sample) > 2200) sample *= 2;\n        return sample;\n    }\n}\n",
    );
  }
  fs.writeFileSync(javaPath, java);
}
