import { describe, expect, it } from "vitest";
import { parseNotification, toCsv } from "../lib/notification-parser";

describe("notification parser", () => {
  it("extracts wallet deposit fields and normalizes Arabic digits", () => {
    const row = parseNotification(
      "إشعار إيداع محفظة\nرقم المرجع: WLT-78421\nالمبلغ: ١٢٥٠٠٠ ريال\nالعمولة: ٥٠٠\nاسم المودع: مؤسسة النور",
      "wallet.png",
      "1",
    );
    expect(row.kind).toBe("إيداع محفظة");
    expect(row.reference).toBe("WLT-78421");
    expect(row.amount).toBe("125000");
    expect(row.commission).toBe("500");
    expect(row.depositor).toBe("مؤسسة النور");
    expect(row.reviewState).toBe("جاهز");
  });

  it("flags missing references and amounts for manual review", () => {
    const row = parseNotification("إشعار حوالة صرافة\nاسم المودع: عميل", "blurred.jpg", "2");
    expect(row.reference).toBe("مراجعة يدوية");
    expect(row.amount).toBe("0");
    expect(row.statement).toContain("خطأ في القراءة");
    expect(row.reviewState).toBe("خطأ في القراءة");
  });

  it("writes UTF-8 BOM and semicolon-delimited Excel CSV", () => {
    const row = parseNotification("محفظة\nالمرجع: 12345\nالمبلغ: 100", "a.jpg", "3");
    const csv = toCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("المؤسسة/شركة الصرافة;الفرع;نوع العملية;رقم المرجع/الإشعار");
    expect(csv).toContain("غير واضح;غير واضح;إيداع محفظة;12345");
  });

  it("extracts exchange receipt fields in label/value layouts", () => {
    const row = parseNotification(
      "شركة القاسمي للصرافة والتحويل\nإشعار مدين\nرقم الإشعار: 272909\nالتاريخ: 2026/08/11\nالمبلغ: 16,000 ريال يمني\nالعمولة: 0\nمن: شركة القاسمي للصرافة\nإلى: محمد أحمد\nرقم الحساب: 1237139",
      "exchange.jpg",
      "4",
    );
    expect(row.reference).toBe("272909");
    expect(row.amount).toBe("16000");
    expect(row.currency).toContain("ريال");
    expect(row.date).toBe("2026/08/11");
    expect(row.transactionNumber).toBe("1237139");
    expect(row.senderName).toContain("شركة القاسمي");
    expect(row.beneficiaryName).toBe("محمد أحمد");
  });

  it("classifies Qasimi documents and applies debit/credit counterparty rules", () => {
    const debit = parseNotification(
      "شركة القاسمي للصرافة والتحويل\nإشعار مدين\nرقم الإشعار: 272909\nتاريخ الإشعار: 2026/08/11\nالمبلغ قبل العمولة: 16000\nالمبلغ بعد العمولة: 15950\nرقم الحوالة: 981617723\nاسم المستلم: محمد أحمد عبد الله\n11/08/2026 08:26:13 PM",
      "qasimi-debit.jpg",
      "5",
    );
    expect(debit.documentType).toBe("مستندات شركة القاسمي");
    expect(debit.noticeType).toContain("مدين");
    expect(debit.amountBeforeCommission).toBe("16000");
    expect(debit.amountAfterCommission).toBe("15950");
    expect(debit.transferNumber).toBe("981617723");
    expect(debit.transferRecipientName).toContain("محمد أحمد عبد الله");
    expect(debit.printTime).toBe("08:26:13 PM");

    const credit = parseNotification("شركة القاسمي\nإشعار دائن\nاسم المرسل: مؤسسة الخير", "qasimi-credit.jpg", "6");
    expect(credit.transferSenderName).toContain("مؤسسة الخير");
  });

  it("classifies Jawib wallet documents deterministically", () => {
    expect(parseNotification("Jawib wallet\nإيداع محفظة", "jawib.jpg", "7").documentType).toBe("مستندات محفظة جيب");
  });

  it("keeps a recipient name that continues across OCR lines", () => {
    const row = parseNotification("شركة القاسمي\nإشعار مدين\nإلى: هشام عبدالوهاب\nيعقوب أحمد\nالحطامي\nالمبلغ: 1000 ريال", "name-lines.jpg", "8");
    expect(row.beneficiaryName).toBe("هشام عبدالوهاب يعقوب أحمد الحطامي");
    expect(row.transferRecipientName).toBe("هشام عبدالوهاب يعقوب أحمد الحطامي");
  });

  it("keeps Jawib fields isolated from Qasimi fields", () => {
    const row = parseNotification(
      "شعار جيب Jawib\nالمبلغ: 12500 ريال\nرقم مرجع العملية: 987654321\nالعملية: إيداع\nتاريخ العملية: 2026/10/27 10:30 AM\nالمستفيد: هشام أحمد 771234567\nالمودع: مؤسسة النور 778765432\nالبيان: دفعة شهرية 2026",
      "jawib-fields.jpg",
      "9",
    );
    expect(row.documentType).toBe("مستندات محفظة جيب");
    expect(row.walletAmount).toBe("12500");
    expect(row.walletCurrency).toContain("ريال");
    expect(row.walletOperation).toContain("إيداع");
    expect(row.walletOperationDateTime).toContain("2026/10/27");
    expect(row.walletBeneficiary).toContain("هشام أحمد");
    expect(row.walletDepositor).toContain("مؤسسة النور");
    expect(row.qasimiAccountAmount).toBe("");
  });

  it("separates Qasimi debit and credit fields", () => {
    const debit = parseNotification(
      "شركة القاسمي\nإشعار مدين\nرقم الإشعار: 272909\nتاريخ الإشعار: 2026/10/27\nالسيد: محمد أحمد عبد الله\nرقم الحساب: 1237139\nعملة الحساب: ريال يمني\nمبلغ الحساب: 16000\nالعمولة: 500\nالمبلغ شامل العمولة: 16500\nالبيان: مستلم الحوالة - مرسل الحوالة - 981617723 - 778899",
      "qasimi-debit-fields.jpg",
      "10",
    );
    expect(debit.qasimiPerson).toContain("محمد أحمد عبد الله");
    expect(debit.qasimiCommission).toBe("500");
    expect(debit.qasimiAmountIncludingCommission).toBe("16500");
    expect(debit.qasimiCreditSender).toBe("");

    const credit = parseNotification(
      "شركة القاسمي\nإشعار دائن\nرقم الإشعار: 272910\nمبلغ الحساب: 7000 ريال\nالبيان: مؤسسة الخير 778899 - 981617724 - حوالة راتب 2026",
      "qasimi-credit-fields.jpg",
      "11",
    );
    expect(credit.qasimiCreditSender).toContain("مؤسسة الخير");
    expect(credit.qasimiDescriptionNumbers).toContain("2026");
    expect(credit.qasimiCommission).toBe("");
    expect(credit.qasimiAmountIncludingCommission).toBe("");
  });
});
