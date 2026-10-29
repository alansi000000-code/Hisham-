import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  DEMO_OCR_TEXT,
  parseNotification,
  toCsv,
  type ParsedNotification,
  type ReviewState,
} from "@/lib/notification-parser";
import { recognizeLocalText } from "@/lib/ocr-adapter";

const COLORS = {
  ink: "#16343b",
  muted: "#6b7d80",
  teal: "#0f766e",
  tealDark: "#0b4f4b",
  tealPale: "#e3f2ee",
  canvas: "#f7f4ec",
  card: "#ffffff",
  line: "#e4e8e3",
  amber: "#b45309",
  amberPale: "#fff2dc",
  red: "#b42318",
  redPale: "#ffebe8",
  green: "#177245",
  greenPale: "#e4f5e9",
};

function StatusPill({ state }: { state: ReviewState }) {
  const palette = state === "جاهز"
    ? { bg: COLORS.greenPale, color: COLORS.green }
    : state === "خطأ في القراءة"
      ? { bg: COLORS.redPale, color: COLORS.red }
      : { bg: COLORS.amberPale, color: COLORS.amber };
  return (
    <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: palette.color }]} />
      <Text style={[styles.statusText, { color: palette.color }]}>{state}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder="غير واضح"
        placeholderTextColor="#a4b0ad"
        style={styles.fieldInput}
        textAlign="right"
      />
    </View>
  );
}

export default function HomeScreen() {
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [rows, setRows] = useState<ParsedNotification[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("جاهز لاستقبال صور الإشعارات");
  const [lastEngine, setLastEngine] = useState("");
  const [resultTab, setResultTab] = useState<"summary" | "qasimi" | "wallet" | "raw">("summary");
  const [resultFilter, setResultFilter] = useState<"all" | ReviewState>("all");
  const [qasimiFilter, setQasimiFilter] = useState<"all" | "مدين" | "دائن">("all");

  const readyCount = useMemo(() => rows.filter((row) => row.reviewState === "جاهز").length, [rows]);
  const reviewCount = rows.length - readyCount;
  const visibleRows = (resultFilter === "all" ? rows : rows.filter((row) => row.reviewState === resultFilter))
    .filter((row) => qasimiFilter === "all" || row.documentType !== "مستندات شركة القاسمي" || row.noticeType.includes(qasimiFilter));
  const tabRows = resultTab === "qasimi"
    ? visibleRows.filter((row) => row.documentType === "مستندات شركة القاسمي")
    : resultTab === "wallet"
      ? visibleRows.filter((row) => row.documentType === "مستندات محفظة جيب")
      : visibleRows;

  async function pickImages() {
    setNotice("اختر صور الإشعارات من الاستوديو");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 1,
    });
    if (!result.canceled) {
      setAssets(result.assets);
      setRows([]);
      setNotice(`تم اختيار ${result.assets.length} ${result.assets.length === 1 ? "صورة" : "صور"} — اضغط بدء المعالجة`);
    }
  }

  async function processImages() {
    if (!assets.length || processing) return;
    setProcessing(true);
    setRows([]);
    setProgress(0);
    setNotice("تجهيز محرك OCR المحلي…");
    const nextRows: ParsedNotification[] = [];
    let engine = "";
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const sourceName = asset.fileName || `إشعار ${index + 1}`;
      setNotice(`جاري معالجة ${index + 1} من ${assets.length}: ${sourceName}`);
      try {
        const result = await recognizeLocalText(asset.uri, sourceName);
        engine = result.engine;
        nextRows.push(parseNotification(result.text, sourceName, `${Date.now()}-${index}`));
      } catch (error) {
        const fallback = parseNotification("", sourceName, `${Date.now()}-${index}`);
        fallback.statement = "تعذر تشغيل OCR المحلي — مراجعة يدوية [خطأ في القراءة]";
        fallback.reviewState = "خطأ في القراءة";
        fallback.rawText = error instanceof Error ? error.message : "تعذر تشغيل محرك OCR";
        nextRows.push(fallback);
      }
      setRows([...nextRows]);
      setProgress((index + 1) / assets.length);
    }
    setLastEngine(engine || (Platform.OS === "web" ? "معاينة المتصفح" : "OCR محلي"));
    setNotice(`اكتملت معالجة ${assets.length} ${assets.length === 1 ? "صورة" : "صور"}`);
    setProcessing(false);
  }

  function loadDemo() {
    const demo = parseNotification(DEMO_OCR_TEXT, "مثال إشعار محفظة", `demo-${Date.now()}`);
    setAssets([]);
    setRows([demo]);
    setLastEngine("بيانات مثال محلية");
    setNotice("تم تحميل نتيجة مثال — يمكنك تعديلها ثم تصديرها");
  }

  function updateRow(id: string, field: keyof ParsedNotification, value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  async function exportCsv() {
    if (!rows.length) {
      setNotice("اختر صوراً أو حمّل المثال أولاً");
      return;
    }
    try {
      const csv = toCsv(rows);
      const filename = `كشف-الإشعارات-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        setNotice("تم تنزيل ملف CSV على الجهاز");
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "مشاركة كشف الإشعارات",
          UTI: "public.comma-separated-values-text",
        });
        setNotice("تم فتح قائمة المشاركة — اختر البريد أو واتساب أو البلوتوث");
      } else {
        setNotice("تم إنشاء الملف، لكن المشاركة غير متاحة على هذا الجهاز");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء الملف";
      if (Platform.OS === "web") setNotice(message);
      else Alert.alert("تعذر التصدير", message);
    }
  }

  function clearAll() {
    setAssets([]);
    setRows([]);
    setProgress(0);
    setLastEngine("");
    setNotice("جاهز لاستقبال صور الإشعارات");
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#f7f4ec]" safeAreaClassName="bg-[#f7f4ec]">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topLine}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>ص</Text>
            </View>
            <View style={styles.brandCopy}>
              <Text style={styles.eyebrow}>أداة تفريغ محاسبي محلية</Text>
              <Text style={styles.brandName}>HISHAM</Text>
            </View>
            <View style={styles.offlineBadge}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>بدون إنترنت</Text>
            </View>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Text style={styles.heroIconText}>↗</Text></View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>من صورة إشعار إلى كشف مرتب</Text>
              <Text style={styles.heroSubtitle}>استخرج الحقول، راجعها، وشارك ملف Excel خلال دقائق.</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>ابدأ بالصور</Text>
              <Text style={styles.sectionHint}>يدعم إشعارات الحوالات وإيداعات المحافظ</Text>
            </View>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>01</Text></View>
          </View>

          <Pressable
            onPress={pickImages}
            disabled={processing}
            style={({ pressed }) => [styles.dropZone, pressed && styles.pressed, processing && styles.disabled]}
          >
            <View style={styles.uploadIcon}><Text style={styles.uploadIconText}>＋</Text></View>
            <View style={styles.dropCopy}>
              <Text style={styles.dropTitle}>{assets.length ? `${assets.length} صور جاهزة للمعالجة` : "اختر صور الإشعارات"}</Text>
              <Text style={styles.dropHint}>يمكن تحديد أكثر من صورة دفعة واحدة</Text>
            </View>
            <Text style={styles.chevron}>‹</Text>
          </Pressable>

          <View style={styles.actionRow}>
            <Pressable
              onPress={processImages}
              disabled={!assets.length || processing}
              style={({ pressed }) => [styles.primaryButton, (!assets.length || processing) && styles.disabled, pressed && styles.pressed]}
            >
              {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonIcon}>↻</Text>}
              <Text style={styles.primaryButtonText}>{processing ? "جاري المعالجة…" : "بدء المعالجة"}</Text>
            </Pressable>
            <Pressable onPress={loadDemo} disabled={processing} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>تجربة مثال</Text>
            </Pressable>
          </View>

          <View style={styles.statusCard}>
            <View style={[styles.statusRing, processing && styles.statusRingActive]}>
              <Text style={styles.statusRingText}>{processing ? `${Math.round(progress * 100)}%` : rows.length ? rows.length : "—"}</Text>
            </View>
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>{notice}</Text>
              <Text style={styles.statusMeta}>
                {lastEngine || "ستظهر هنا حالة المعالجة والمحرك المستخدم"}
              </Text>
            </View>
          </View>

          {rows.length > 0 && (
            <>
              <View style={styles.resultsHeader}>
                <View>
                  <Text style={styles.sectionTitle}>مراجعة النتائج</Text>
                  <Text style={styles.sectionHint}>{readyCount} جاهزة · {reviewCount} تحتاج انتباهاً</Text>
                </View>
                <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>02</Text></View>
              </View>

              <View style={styles.filterRow}>
                {(["all", "جاهز", "مراجعة يدوية", "خطأ في القراءة"] as const).map((filter) => (
                  <Pressable key={filter} onPress={() => setResultFilter(filter)} style={[styles.filterChip, resultFilter === filter && styles.filterChipActive]}>
                    <Text style={[styles.filterChipText, resultFilter === filter && styles.filterChipTextActive]}>{filter === "all" ? "الكل" : filter}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.tabsRow}>
                {([["summary", "الأساسي"], ["qasimi", "القاسمي"], ["wallet", "المحفظة"], ["raw", "النص الكامل"]] as const).map(([tab, label]) => (
                  <Pressable key={tab} onPress={() => setResultTab(tab)} style={[styles.tabButton, resultTab === tab && styles.tabButtonActive]}>
                    <Text style={[styles.tabText, resultTab === tab && styles.tabTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {resultTab === "qasimi" && (
                <View style={styles.filterRow}>
                  {(["all", "مدين", "دائن"] as const).map((filter) => (
                    <Pressable key={filter} onPress={() => setQasimiFilter(filter)} style={[styles.filterChip, qasimiFilter === filter && styles.filterChipActive]}>
                      <Text style={[styles.filterChipText, qasimiFilter === filter && styles.filterChipTextActive]}>{filter === "all" ? "كل إشعارات القاسمي" : `القاسمي ${filter}`}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {tabRows.map((row, index) => (
                <View key={row.id} style={styles.resultCard}>
                  <View style={styles.resultTopLine}>
                    <View style={styles.resultIdentity}>
                      <View style={styles.resultNumber}><Text style={styles.resultNumberText}>{String(index + 1).padStart(2, "0")}</Text></View>
                      <View>
                        <Text style={styles.resultSource} numberOfLines={1}>{row.sourceName}</Text>
                        <Text style={styles.resultType}>{row.documentType} · {row.kind}</Text>
                      </View>
                    </View>
                    <StatusPill state={row.reviewState} />
                  </View>
                  <View style={styles.fieldsGrid}>
                    {resultTab === "summary" && <>
                      <Field label="تصنيف المستند" value={row.documentType} onChangeText={(value) => updateRow(row.id, "documentType", value)} />
                      <Field label="حالة المراجعة" value={row.reviewState} onChangeText={(value) => updateRow(row.id, "reviewState", value as ReviewState)} />
                      <Field label="المؤسسة" value={row.institution} onChangeText={(value) => updateRow(row.id, "institution", value)} />
                    </>}
                    {resultTab === "qasimi" && row.documentType === "مستندات شركة القاسمي" && <>
                      <Field label="نوع الإشعار" value={row.noticeType} onChangeText={(value) => updateRow(row.id, "noticeType", value)} />
                      <Field label="رقم الإشعار" value={row.noticeNumber} onChangeText={(value) => updateRow(row.id, "noticeNumber", value)} />
                      <Field label="تاريخ الإشعار" value={row.noticeDate} onChangeText={(value) => updateRow(row.id, "noticeDate", value)} />
                      <Field label="السيد" value={row.qasimiPerson} onChangeText={(value) => updateRow(row.id, "qasimiPerson", value)} />
                      <Field label="رقم الحساب" value={row.accountNumber} onChangeText={(value) => updateRow(row.id, "accountNumber", value)} />
                      <Field label="عملة الحساب" value={row.qasimiAccountCurrency} onChangeText={(value) => updateRow(row.id, "qasimiAccountCurrency", value)} />
                      <Field label="مبلغ الحساب" value={row.qasimiAccountAmount} keyboardType="numeric" onChangeText={(value) => updateRow(row.id, "qasimiAccountAmount", value)} />
                      {row.noticeType.includes("مدين") && <>
                        <Field label="العمولة" value={row.qasimiCommission} keyboardType="numeric" onChangeText={(value) => updateRow(row.id, "qasimiCommission", value)} />
                        <Field label="شامل العمولة" value={row.qasimiAmountIncludingCommission} keyboardType="numeric" onChangeText={(value) => updateRow(row.id, "qasimiAmountIncludingCommission", value)} />
                        <Field label="مستلم الحوالة" value={row.qasimiDebitRecipient} onChangeText={(value) => updateRow(row.id, "qasimiDebitRecipient", value)} />
                        <Field label="مرسل الحوالة" value={row.qasimiDebitSender} onChangeText={(value) => updateRow(row.id, "qasimiDebitSender", value)} />
                        <Field label="رقم الحوالة" value={row.qasimiTransferNumber} onChangeText={(value) => updateRow(row.id, "qasimiTransferNumber", value)} />
                        <Field label="الرقم العام" value={row.qasimiGeneralNumber} onChangeText={(value) => updateRow(row.id, "qasimiGeneralNumber", value)} />
                        <Field label="البيان" value={row.qasimiDescription} onChangeText={(value) => updateRow(row.id, "qasimiDescription", value)} />
                      </>}
                      {row.noticeType.includes("دائن") && <>
                        <Field label="المرسل" value={row.qasimiCreditSender} onChangeText={(value) => updateRow(row.id, "qasimiCreditSender", value)} />
                        <Field label="رقم الحوالة" value={row.qasimiTransferNumber} onChangeText={(value) => updateRow(row.id, "qasimiTransferNumber", value)} />
                        <Field label="البيان (كلمات)" value={row.qasimiDescription} onChangeText={(value) => updateRow(row.id, "qasimiDescription", value)} />
                        <Field label="أرقام البيان" value={row.qasimiDescriptionNumbers} onChangeText={(value) => updateRow(row.id, "qasimiDescriptionNumbers", value)} />
                      </>}
                    </>}
                    {resultTab === "wallet" && row.documentType === "مستندات محفظة جيب" && <>
                      <Field label="المبلغ" value={row.walletAmount} keyboardType="numeric" onChangeText={(value) => updateRow(row.id, "walletAmount", value)} />
                      <Field label="عملة المبلغ" value={row.walletCurrency} onChangeText={(value) => updateRow(row.id, "walletCurrency", value)} />
                      <Field label="رقم مرجع العملية" value={row.reference} onChangeText={(value) => updateRow(row.id, "reference", value)} />
                      <Field label="العملية" value={row.walletOperation} onChangeText={(value) => updateRow(row.id, "walletOperation", value)} />
                      <Field label="تاريخ العملية" value={row.walletOperationDateTime} onChangeText={(value) => updateRow(row.id, "walletOperationDateTime", value)} />
                      <Field label="المستفيد" value={row.walletBeneficiary} onChangeText={(value) => updateRow(row.id, "walletBeneficiary", value)} />
                      <Field label="المودع" value={row.walletDepositor} onChangeText={(value) => updateRow(row.id, "walletDepositor", value)} />
                      <View style={styles.fieldWrapWide}><Text style={styles.fieldLabel}>البيان</Text><TextInput value={row.walletStatement} onChangeText={(value) => updateRow(row.id, "walletStatement", value)} style={[styles.fieldInput, styles.statementInput]} multiline textAlign="right" /></View>
                    </>}
                    {resultTab === "raw" && <View style={styles.fieldWrapWide}><Text style={styles.fieldLabel}>النص الكامل — لا يتم إسقاط أي معلومة</Text><TextInput value={row.rawText} onChangeText={(value) => updateRow(row.id, "rawText", value)} style={[styles.fieldInput, styles.statementInput, { minHeight: 180 }]} multiline textAlign="right" /></View>}
                  </View>
                </View>
              ))}

              <View style={styles.exportSection}>
                <View style={styles.sectionHeaderCompact}>
                  <View>
                    <Text style={styles.sectionTitle}>03 · التصدير والمشاركة</Text>
                    <Text style={styles.sectionHint}>CSV بترميز UTF-8 وفاصل منقوطة ;</Text>
                  </View>
                </View>
                <Pressable onPress={exportCsv} style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}>
                  <Text style={styles.exportIcon}>⇧</Text>
                  <View style={styles.exportCopy}>
                    <Text style={styles.exportTitle}>تصدير ومشاركة الملف</Text>
                    <Text style={styles.exportHint}>البريد · واتساب · البلوتوث · المزيد</Text>
                  </View>
                  <Text style={styles.chevronLight}>‹</Text>
                </Pressable>
                <Pressable onPress={clearAll} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
                  <Text style={styles.clearButtonText}>مسح النتائج والبدء من جديد</Text>
                </Pressable>
              </View>
            </>
          )}

          {!rows.length && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌁</Text></View>
              <Text style={styles.emptyTitle}>ستظهر النتائج هنا</Text>
              <Text style={styles.emptyText}>بعد المعالجة ستتمكن من تعديل المرجع والمبلغ والبيان قبل إنشاء ملف CSV.</Text>
            </View>
          )}

          <Text style={styles.footerNote}>المعالجة محلية · راجع الحقول قبل اعتماد الكشف</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 36, gap: 18 },
  topLine: { flexDirection: "row-reverse", alignItems: "center", marginTop: 8, gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.teal, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#fff", fontSize: 23, fontWeight: "800" },
  brandCopy: { flex: 1, alignItems: "flex-end" },
  eyebrow: { color: COLORS.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  brandName: { color: COLORS.ink, fontSize: 18, fontWeight: "800", marginTop: 1 },
  offlineBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: COLORS.tealPale, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.teal },
  offlineText: { color: COLORS.tealDark, fontSize: 10, fontWeight: "800" },
  heroCard: { backgroundColor: COLORS.tealDark, borderRadius: 24, padding: 20, flexDirection: "row-reverse", alignItems: "center", gap: 14, shadowColor: COLORS.tealDark, shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  heroIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  heroIconText: { color: "#fff", fontSize: 30, fontWeight: "300" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { color: "#fff", fontSize: 19, fontWeight: "800", textAlign: "right", lineHeight: 27 },
  heroSubtitle: { color: "#cce5df", fontSize: 12, lineHeight: 19, marginTop: 5, textAlign: "right" },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionHeaderCompact: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "800", textAlign: "right" },
  sectionHint: { color: COLORS.muted, fontSize: 11, marginTop: 3, textAlign: "right" },
  stepBadge: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#e8eee9", alignItems: "center", justifyContent: "center" },
  stepBadgeText: { color: COLORS.tealDark, fontSize: 12, fontWeight: "900" },
  dropZone: { minHeight: 92, borderRadius: 19, borderWidth: 1.5, borderColor: "#b9d6cd", borderStyle: "dashed", backgroundColor: "#fbfffc", padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  uploadIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: COLORS.tealPale, alignItems: "center", justifyContent: "center" },
  uploadIconText: { color: COLORS.teal, fontSize: 30, fontWeight: "300", lineHeight: 32 },
  dropCopy: { flex: 1, alignItems: "flex-end" },
  dropTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "800", textAlign: "right" },
  dropHint: { color: COLORS.muted, fontSize: 11, marginTop: 4, textAlign: "right" },
  chevron: { color: COLORS.teal, fontSize: 29, fontWeight: "200", transform: [{ rotate: "180deg" }] },
  actionRow: { flexDirection: "row-reverse", gap: 10 },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: COLORS.teal, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  buttonIcon: { color: "#d8f4e9", fontSize: 21 },
  secondaryButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: 16, backgroundColor: "#edf1ed", alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: COLORS.tealDark, fontSize: 13, fontWeight: "800" },
  statusCard: { minHeight: 76, padding: 13, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  statusRing: { width: 49, height: 49, borderRadius: 25, backgroundColor: "#f2f5f1", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#d8e3dc" },
  statusRingActive: { borderColor: COLORS.teal, backgroundColor: COLORS.tealPale },
  statusRingText: { color: COLORS.tealDark, fontSize: 14, fontWeight: "900" },
  statusCopy: { flex: 1, alignItems: "flex-end" },
  statusTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "800", textAlign: "right" },
  statusMeta: { color: COLORS.muted, fontSize: 10, marginTop: 4, textAlign: "right" },
  resultsHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  filterRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: -8 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 10, paddingVertical: 7 },
  filterChipActive: { backgroundColor: COLORS.tealPale, borderColor: "#a9d5c7" },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  filterChipTextActive: { color: COLORS.tealDark },
  tabsRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: COLORS.line, gap: 5 },
  tabButton: { paddingHorizontal: 11, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabButtonActive: { borderBottomColor: COLORS.teal },
  tabText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  tabTextActive: { color: COLORS.tealDark },
  resultCard: { borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, padding: 14, gap: 13 },
  resultTopLine: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  resultIdentity: { flexDirection: "row-reverse", alignItems: "center", gap: 9, flex: 1 },
  resultNumber: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.tealPale, alignItems: "center", justifyContent: "center" },
  resultNumberText: { color: COLORS.tealDark, fontSize: 11, fontWeight: "900" },
  resultSource: { color: COLORS.ink, fontSize: 13, fontWeight: "800", maxWidth: 150, textAlign: "right" },
  resultType: { color: COLORS.muted, fontSize: 11, marginTop: 2, textAlign: "right" },
  statusPill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "800" },
  fieldsGrid: { gap: 10 },
  fieldWrap: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  fieldWrapWide: { gap: 5 },
  fieldLabel: { minWidth: 81, color: COLORS.muted, fontSize: 11, fontWeight: "700", textAlign: "right" },
  fieldInput: { flex: 1, minHeight: 39, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7, color: COLORS.ink, fontSize: 12, backgroundColor: "#fbfcfa" },
  statementInput: { minHeight: 55, width: "100%" },
  exportSection: { marginTop: 5, gap: 10 },
  exportButton: { minHeight: 72, borderRadius: 19, backgroundColor: COLORS.teal, paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  exportIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.16)", textAlign: "center", textAlignVertical: "center", color: "#fff", fontSize: 25, lineHeight: 39 },
  exportCopy: { flex: 1, alignItems: "flex-end" },
  exportTitle: { color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "right" },
  exportHint: { color: "#cce5df", fontSize: 11, marginTop: 4, textAlign: "right" },
  chevronLight: { color: "#d8f4e9", fontSize: 29, transform: [{ rotate: "180deg" }] },
  clearButton: { alignItems: "center", paddingVertical: 5 },
  clearButtonText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  emptyCard: { borderRadius: 20, backgroundColor: "#f0f5f0", borderWidth: 1, borderColor: "#dfebe1", padding: 20, alignItems: "center", gap: 7 },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#dcece3", alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyIconText: { color: COLORS.teal, fontSize: 28 },
  emptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  emptyText: { color: COLORS.muted, fontSize: 11, lineHeight: 18, textAlign: "center", maxWidth: 270 },
  footerNote: { color: "#93a19e", fontSize: 10, textAlign: "center", marginTop: 2 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
