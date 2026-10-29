export type NotificationKind = "إيداع محفظة" | "حوالة صرافة";
export type ReviewState = "جاهز" | "مراجعة يدوية" | "خطأ في القراءة";
export type DocumentType = "مستندات شركة القاسمي" | "مستندات محفظة جيب" | "غير محدد";

export type ParsedNotification = {
  id: string;
  sourceName: string;
  documentType: DocumentType;
  institution: string;
  branch: string;
  operationType: string;
  reference: string;
  transactionNumber: string;
  accountNumber: string;
  kind: NotificationKind;
  amount: string;
  currency: string;
  commission: string;
  amountBeforeCommission: string;
  amountAfterCommission: string;
  noticeNumber: string;
  noticeType: string;
  noticeDate: string;
  transferNumber: string;
  transferRecipientName: string;
  transferSenderName: string;
  date: string;
  time: string;
  printDate: string;
  printTime: string;
  senderName: string;
  senderPhone: string;
  senderAccount: string;
  beneficiaryName: string;
  beneficiaryPhone: string;
  beneficiaryAccount: string;
  purpose: string;
  employee: string;
  depositor: string;
  walletAmount: string;
  walletCurrency: string;
  walletOperation: string;
  walletOperationDateTime: string;
  walletBeneficiary: string;
  walletDepositor: string;
  walletStatement: string;
  qasimiPerson: string;
  qasimiAccountCurrency: string;
  qasimiAccountAmount: string;
  qasimiCommission: string;
  qasimiAmountIncludingCommission: string;
  qasimiDebitRecipient: string;
  qasimiDebitSender: string;
  qasimiCreditSender: string;
  qasimiTransferNumber: string;
  qasimiGeneralNumber: string;
  qasimiDescription: string;
  qasimiDescriptionNumbers: string;
  statement: string;
  rawText: string;
  reviewState: ReviewState;
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeArabicDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_DIGITS.indexOf(digit)));
}

function cleanText(value: string) {
  return normalizeArabicDigits(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function cleanValue(value: string) {
  return value.replace(/[|؛،,]+$/g, "").replace(/^(?:[:#\-–—.]|\s)+/g, "").trim();
}

function normalizeMoney(value: string) {
  const normalized = normalizeArabicDigits(value).replace(/،/g, ",").trim();
  const numberOnly = normalized.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  return numberOnly || "0";
}

function labelValue(text: string, labels: string[]) {
  const label = labels.join("|");
  return cleanValue(firstMatch(text, [
    new RegExp(`(?:${label})\\s*[:：#\\-–—]?\\s*([^\\n]+)`, "i"),
    new RegExp(`([^\\n]{2,})\\s*[:：]?\\s*(?:${label})`, "i"),
  ]));
}

function numberAfterLabel(text: string, labels: string[]) {
  const label = labels.join("|");
  return cleanValue(firstMatch(text, [
    new RegExp(`(?:${label})\\s*[:：#\\-–—]?\\s*([A-Z0-9٠-٩۰-۹/_-]{3,})`, "i"),
  ]));
}

export function classifyNotification(text: string): NotificationKind {
  return /محفظة|المحفظه|إيداع|ايداع|رصيد|wallet/i.test(text)
    ? "إيداع محفظة"
    : "حوالة صرافة";
}

export function classifyDocument(text: string): DocumentType {
  if (/القاسمي|القاسمى|al[- ]?qasimi|qasimi|money exchange/i.test(text)) return "مستندات شركة القاسمي";
  if (/محفظة\s*جيب|جيب\s*محفظة|\bjaib\b|\bjawib\b|wallet/i.test(text)) return "مستندات محفظة جيب";
  return "غير محدد";
}

function multilineLabelValue(text: string, labels: string[]) {
  const label = labels.join("|");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const stop = /^(?:رقم|المبلغ|العمولة|التاريخ|وقت|نوع|الموظف|التوقيع|الإجمالي|الفرع|من|إلى|الى|البيان|الغرض|حساب|هاتف)/i;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`(?:${label})\\s*[:：#\\-–—]?\\s*(.*)$`, "i"));
    if (!match) continue;
    const values = [cleanValue(match[1])].filter(Boolean);
    for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
      const next = lines[index + offset];
      if (stop.test(next) || /[0-9]{4,}/.test(next)) break;
      if (/^[\u0600-\u06ffA-Za-z][^:：]{1,120}$/.test(next)) values.push(next);
      else break;
    }
    if (values.length) return values.join(" ").trim();
  }
  return "";
}

function labelBlockValue(text: string, labels: string[], stopLabels: string[]) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const label = labels.join("|");
  const stop = new RegExp(`^(?:${stopLabels.join("|")})\\s*[:：#\\-–—]?`, "i");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`(?:${label})\\s*[:：#\\-–—]?\\s*(.*)$`, "i"));
    if (!match) continue;
    const values = [cleanValue(match[1])].filter(Boolean);
    for (let offset = 1; offset <= 5 && index + offset < lines.length; offset += 1) {
      const next = lines[index + offset];
      if (stop.test(next)) break;
      values.push(next);
    }
    if (values.length) return values.join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function labelNameAndNumber(text: string, labels: string[]) {
  return labelBlockValue(text, labels, ["رقم", "العملية", "التاريخ", "المستفيد", "المودع", "البيان", "المبلغ"])
    || multilineLabelValue(text, labels);
}

function numbersOnly(value: string) {
  return normalizeArabicDigits(value).match(/[0-9][0-9,./_-]*/g)?.join(" ") || "";
}

function wordsOnly(value: string) {
  return value.replace(/[0-9٠-٩۰-۹]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseNotification(rawText: string, sourceName: string, id: string): ParsedNotification {
  const text = cleanText(rawText);
  const kind = classifyNotification(text);
  const documentType = classifyDocument(text);
  const reference = numberAfterLabel(text, ["رقم\\s*المرجع", "المرجع", "مرجع", "الإشعار", "رقم\\s*الإشعار", "reference", "ref"])
    || cleanValue(firstMatch(text, [/(?:^|\n)([0-9]{5,})\s*(?:\n|$)/]))
    || "";
  const transactionNumber = numberAfterLabel(text, ["رقم\\s*العملية", "رقم\\s*الحوالة", "رقم\\s*الحساب", "transaction"]);
  const accountNumber = numberAfterLabel(text, ["رقم\\s*الحساب", "الحساب", "account"]);
  const amountMatch = firstMatch(text, [
    /(?:المبلغ|مبلغ\s*الحساب|القيمة|الإجمالي|المطلوب|amount)\s*[:：#\-–—]?\s*([0-9][0-9,،.]*)/i,
    /([0-9][0-9,،.]*)\s*(?:ريال|ر\.س|ر\.ي|ريال\s*يمني|ر\.يمني|sar|دولار)/i,
    /(?:#)?([0-9][0-9,،.]*)\s*$/im,
  ]);
  const beforeCommissionMatch = firstMatch(text, [
    /(?:المبلغ\s*قبل\s*العمولة|قبل\s*العمولة|إجمالي\s*المبلغ|المبلغ\s*الإجمالي)\s*[:：#\-–—]?\s*([0-9][0-9,،.]*)/i,
  ]);
  const afterCommissionMatch = firstMatch(text, [
    /(?:المبلغ\s*بعد\s*العمولة|بعد\s*العمولة|صافي\s*المبلغ|المبلغ\s*الصافي|المبلغ\s*المستلم)\s*[:：#\-–—]?\s*([0-9][0-9,،.]*)/i,
  ]);
  const commissionMatch = firstMatch(text, [
    /(?:العمولة|الرسوم|عمولة|commission|fee)\s*[:：#\-–—]?\s*([0-9][0-9,،.]*)/i,
    /([0-9][0-9,،.]*)\s*(?:ريال|ر\.ي)\s*(?:العمولة|رسوم)/i,
  ]);
  const allDates = [...text.matchAll(/[0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4}/g)].map((match) => match[0]);
  const date = firstMatch(text, [
    /(?:التاريخ|تاريخ\s*العملية|date)\s*[:：#\-–—]?\s*([0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4})/i,
    /([0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4})/,
  ]);
  const allTimes = [...text.matchAll(/[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM|ص|م)?/gi)].map((match) => match[0].trim());
  const time = firstMatch(text, [
    /(?:الوقت|وقت\s*العملية|time)\s*[:：#\-–—]?\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM|ص|م)?)/i,
    /\(([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\)/,
  ]) || allTimes[0] || "";
  const printDate = allDates.length > 1 ? allDates[allDates.length - 1] : (documentType === "مستندات شركة القاسمي" ? (date || "") : "");
  const printTime = allTimes.length > 1 ? allTimes[allTimes.length - 1] : (documentType === "مستندات شركة القاسمي" ? time : "");
  const institution = labelValue(text, ["المؤسسة", "اسم\\s*الشركة", "شركة\\s*الصرافة", "Al-Qasimi", "القاسمي"])
    || cleanValue(firstMatch(text, [/^([^\n]*(?:للصرافة|للتحويل|Money Exchange)[^\n]*)/im]));
  const branch = labelValue(text, ["الفرع", "branch"]);
  const operationType = cleanValue(firstMatch(text, [/(إشعار\s+(?:مدين|دائن|تحويل)|إيداع\s+(?:نقدي|محفظة)|حوالة\s+صرافة|عملية\s+[^\n]+)/i])) || kind;
  const noticeNumber = numberAfterLabel(text, ["رقم\\s*الإشعار", "رقم\\s*الإشعار\\s*المدين", "رقم\\s*الإشعار\\s*الدائن"]);
  const noticeType = cleanValue(firstMatch(text, [/(إشعار\s+(?:مدين|دائن))/i, /(?:نوع\\s*الإشعار)\s*[:：]?\s*([^\n]+)/i])) || operationType;
  const noticeDate = labelValue(text, ["تاريخ\\s*الإشعار", "تاريخ\\s*الاشعار"]);
  const transferNumber = numberAfterLabel(text, ["رقم\\s*الحوالة", "رقم\\s*التحويل", "transfer\\s*number"]) || transactionNumber;
  const senderName = multilineLabelValue(text, ["اسم\\s*المرسل", "المرسل", "sender"]) || cleanValue(firstMatch(text, [
    /(?:^|\n)من\s*[:：]?\s*([^\n]+)/i,
    /([^\n]{2,})\s+من\s*[:：]?/i,
    /(?:المرسل|اسم\s*المرسل|sender)\s*[:：]?\s*([^\n]+)/i,
  ]));
  const senderPhone = firstMatch(text, [
    /(?:من|المرسل|هاتف\\s*المرسل|sender)[^\n]*\n\s*([0-9]{7,})/i,
    /(?:جوال|موبايل|هاتف|mobile|phone)\s*[:：]?\s*([0-9]{7,})/i,
  ]);
  const senderAccount = numberAfterLabel(text, ["رقم\\s*حساب\\s*(?:المرسل|من)", "حساب\\s*المرسل", "من\\s*حساب", "sender\\s*account"]);
  const beneficiaryName = multilineLabelValue(text, ["اسم\\s*المستلم", "اسم\\s*المستفيد", "المستلم", "المستفيد", "إلى", "الى", "beneficiary"]) || cleanValue(firstMatch(text, [
    /(?:^|\n)(?:إلى|الى)\s*[:：]?\s*([^\n]+)/i,
    /([^\n]{2,})\s+(?:إلى|الى)\s*[:：]?/i,
    /(?:المستفيد|اسم\s*المستفيد|beneficiary)\s*[:：]?\s*([^\n]+)/i,
  ]));
  const beneficiaryPhone = firstMatch(text, [
    /(?:إلى|الى|المستفيد)[^\n]*\n\s*([0-9]{7,})/i,
  ]);
  const beneficiaryAccount = numberAfterLabel(text, ["رقم\\s*حساب\\s*(?:المستفيد|المستلم)", "حساب\\s*المستفيد", "إلى\\s*حساب", "الى\\s*حساب", "beneficiary\\s*account"]);
  const transferRecipientName = /مدين/i.test(noticeType) ? beneficiaryName : "غير محدد";
  const transferSenderName = /دائن/i.test(noticeType) ? senderName : "غير محدد";
  const purpose = labelValue(text, ["الغرض", "البيان", "سبب\\s*التحويل", "purpose", "description"]);
  const employee = labelValue(text, ["الموظف", "المستخدم", "employee", "user"]);
  const amount = amountMatch ? normalizeMoney(amountMatch) : "0";
  const commission = commissionMatch ? normalizeMoney(commissionMatch) : "0";
  const currency = firstMatch(text, [/(ريال\s*(?:يمني)?|ر\.ي|ر\.س|SAR|دولار)/i]) || "غير محددة";
  const depositor = senderName || labelValue(text, ["اسم\\s*المودع", "المودع", "depositor"]);
  const isWallet = documentType === "مستندات محفظة جيب";
  const isQasimi = documentType === "مستندات شركة القاسمي";
  const isDebit = /مدين/i.test(noticeType);
  const walletOperation = isWallet ? labelBlockValue(text, ["العملية", "نوع العملية", "operation"], ["تاريخ", "المستفيد", "المودع", "البيان", "المبلغ"]) || operationType : "";
  const walletDate = isWallet ? labelValue(text, ["تاريخ\\s*العملية", "التاريخ", "date"]) || date : "";
  const walletTime = isWallet ? firstMatch(text, [/(?:وقت\s*العملية|الوقت|time)\s*[:：]?\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\\s*(?:AM|PM|ص|م)?)/i]) || time : "";
  const walletBeneficiary = isWallet ? labelNameAndNumber(text, ["المستفيد", "اسم\\s*المستفيد", "beneficiary"]) : "";
  const walletDepositor = isWallet ? labelNameAndNumber(text, ["المودع", "اسم\\s*المودع", "depositor"]) : "";
  const walletStatement = isWallet ? labelBlockValue(text, ["البيان", "الوصف", "description"], ["رقم", "العملية", "تاريخ", "المستفيد", "المودع"]) : "";
  const qasimiBody = isQasimi ? labelBlockValue(text, ["البيان", "الوصف", "description"], ["الموظف", "التوقيع", "المجموع"]) : "";
  const qasimiPerson = isQasimi ? labelNameAndNumber(text, ["السيد", "اسم العميل", "العميل"]) : "";
  const qasimiAccountCurrency = isQasimi ? firstMatch(text, [/(?:عملة\s*الحساب|العملة)\s*[:：]?\s*([^\n]+)/i, /([\u0600-\u06ff]+)\s*$/im]) || currency : "";
  const qasimiAccountAmount = isQasimi ? normalizeMoney(firstMatch(text, [/(?:مبلغ\s*الحساب|المبلغ)\s*[:：]?\s*([0-9][0-9,،.]*)/i]) || amount) : "";
  const qasimiCommission = isQasimi && isDebit ? normalizeMoney(commissionMatch || "0") : "";
  const qasimiAmountIncludingCommission = isQasimi && isDebit ? normalizeMoney(firstMatch(text, [/(?:المبلغ\s*شامل\s*العمولة|شامل\s*العمولة|الإجمالي)\s*[:：]?\s*([0-9][0-9,،.]*)/i]) || beforeCommissionMatch || amount) : "";
  const qasimiSegments = qasimiBody.split(/\s*-\s*/).map((segment) => segment.trim()).filter(Boolean);
  const qasimiDebitRecipient = isQasimi && isDebit ? cleanValue(qasimiSegments[0] || beneficiaryName) : "";
  const qasimiDebitSender = isQasimi && isDebit ? cleanValue(qasimiSegments[1] || senderName) : "";
  const qasimiCreditSender = isQasimi && !isDebit ? cleanValue(qasimiSegments[0] || `${senderName} ${senderPhone}`).trim() : "";
  const qasimiTransferNumber = isQasimi ? (transferNumber !== "غير واضح" ? transferNumber : numbersOnly(qasimiSegments[isDebit ? 2 : 1] || qasimiBody)) : "";
  const qasimiGeneralNumber = isQasimi && isDebit ? numbersOnly(qasimiSegments[3] || qasimiBody) : "";
  const qasimiDescription = isQasimi ? wordsOnly(qasimiSegments.slice(isDebit ? 2 : 2).join(" ")) : "";
  const qasimiDescriptionNumbers = isQasimi && !isDebit ? numbersOnly(qasimiSegments.slice(2).join(" ")) : "";
  const hasReference = reference.length > 0;
  const hasAmount = Boolean(amountMatch);
  const issues: string[] = [];
  if (!hasReference) issues.push("مراجعة يدوية");
  if (!hasAmount) issues.push("[خطأ في القراءة]");
  const reviewState: ReviewState = !hasAmount ? "خطأ في القراءة" : !hasReference ? "مراجعة يدوية" : "جاهز";
  const statement = `${kind === "إيداع محفظة" ? "إيداع محفظة إلكترونية" : "حوالة/إشعار صرافة"}${issues.length ? ` — ${issues.join("، ")}` : " — مستخرج من صورة إشعار"}`;

  return {
    id,
    sourceName,
    documentType,
    institution: institution || "غير واضح",
    branch: branch || "غير واضح",
    operationType,
    reference: hasReference ? reference : "مراجعة يدوية",
    transactionNumber: transactionNumber || "غير واضح",
    accountNumber: accountNumber || "غير واضح",
    kind,
    amount,
    currency,
    commission,
    amountBeforeCommission: beforeCommissionMatch ? normalizeMoney(beforeCommissionMatch) : amount,
    amountAfterCommission: afterCommissionMatch ? normalizeMoney(afterCommissionMatch) : amount,
    noticeNumber: noticeNumber || "غير واضح",
    noticeType: noticeType || "غير واضح",
    noticeDate: noticeDate || date || "غير واضح",
    transferNumber: transferNumber || "غير واضح",
    transferRecipientName: transferRecipientName || "غير محدد",
    transferSenderName: transferSenderName || "غير محدد",
    date: date || "غير واضح",
    time: time || "غير واضح",
    printDate: printDate || "غير واضح",
    printTime: printTime || "غير واضح",
    senderName: senderName || "غير واضح",
    senderPhone: senderPhone || "غير واضح",
    senderAccount: senderAccount || "غير واضح",
    beneficiaryName: beneficiaryName || "غير واضح",
    beneficiaryPhone: beneficiaryPhone || "غير واضح",
    beneficiaryAccount: beneficiaryAccount || "غير واضح",
    purpose: purpose || "غير واضح",
    employee: employee || "غير واضح",
    depositor: depositor || "غير واضح",
    walletAmount: isWallet ? amount : "",
    walletCurrency: isWallet ? currency : "",
    walletOperation,
    walletOperationDateTime: isWallet ? `${walletDate || "غير واضح"} ${walletTime || "غير واضح"}`.trim() : "",
    walletBeneficiary,
    walletDepositor,
    walletStatement,
    qasimiPerson,
    qasimiAccountCurrency,
    qasimiAccountAmount,
    qasimiCommission,
    qasimiAmountIncludingCommission,
    qasimiDebitRecipient,
    qasimiDebitSender,
    qasimiCreditSender,
    qasimiTransferNumber,
    qasimiGeneralNumber,
    qasimiDescription,
    qasimiDescriptionNumbers,
    statement,
    rawText: text,
    reviewState,
  };
}

function csvCell(value: string) {
  const safe = String(value ?? "").replace(/"/g, '""');
  return /[;"\n\r]/.test(safe) ? `"${safe}"` : safe;
}

export const CSV_HEADERS = [
  "تصنيف المستند", "المؤسسة/شركة الصرافة", "الفرع", "نوع العملية", "رقم المرجع/الإشعار", "نوع الإشعار", "تاريخ الإشعار", "رقم الحوالة", "اسم مستلم الحوالة", "اسم مرسل الحوالة", "المبلغ قبل العمولة", "المبلغ بعد العمولة", "العمولة", "العملة", "تاريخ العملية", "وقت العملية", "تاريخ الطباعة", "وقت الطباعة", "رقم العملية", "رقم الحساب العام", "اسم المرسل", "هاتف المرسل", "حساب المرسل", "اسم المستلم/المستفيد", "هاتف المستفيد", "حساب المستفيد", "الغرض/البيان", "الموظف", "البيان المحاسبي", "النص الكامل المستخرج", "جيب: المبلغ", "جيب: عملة المبلغ", "جيب: رقم مرجع العملية", "جيب: العملية", "جيب: تاريخ ووقت العملية", "جيب: المستفيد", "جيب: المودع", "جيب: البيان", "القاسمي: السيد", "القاسمي: عملة الحساب", "القاسمي: مبلغ الحساب", "القاسمي: العمولة", "القاسمي: المبلغ شامل العمولة", "القاسمي: مستلم الحوالة", "القاسمي: مرسل الحوالة", "القاسمي: المرسل الدائن", "القاسمي: رقم الحوالة", "القاسمي: الرقم العام", "القاسمي: البيان", "القاسمي: أرقام البيان",
];

export function toCsv(rows: ParsedNotification[]) {
  const lines = [CSV_HEADERS, ...rows.map((row) => [row.documentType, row.institution, row.branch, row.operationType, row.reference, row.noticeType, row.noticeDate, row.transferNumber, row.transferRecipientName, row.transferSenderName, row.amountBeforeCommission, row.amountAfterCommission, row.commission, row.currency, row.date, row.time, row.printDate, row.printTime, row.transactionNumber, row.accountNumber, row.senderName, row.senderPhone, row.senderAccount, row.beneficiaryName, row.beneficiaryPhone, row.beneficiaryAccount, row.purpose, row.employee, row.statement, row.rawText, row.walletAmount, row.walletCurrency, row.reference, row.walletOperation, row.walletOperationDateTime, row.walletBeneficiary, row.walletDepositor, row.walletStatement, row.qasimiPerson, row.qasimiAccountCurrency, row.qasimiAccountAmount, row.qasimiCommission, row.qasimiAmountIncludingCommission, row.qasimiDebitRecipient, row.qasimiDebitSender, row.qasimiCreditSender, row.qasimiTransferNumber, row.qasimiGeneralNumber, row.qasimiDescription, row.qasimiDescriptionNumbers])]
    .map((line) => line.map(csvCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export const DEMO_OCR_TEXT = `شركة القاسمي للصرافة والتحويل\nإشعار مدين\nرقم الإشعار: 272909\nالتاريخ: 2026/08/11\nالمبلغ: 16000 ريال يمني\nالعمولة: 0\nمن: شركة القاسمي للصرافة والتحويل\nإلى: محمد أحمد\nرقم الحساب: 1237139`;
