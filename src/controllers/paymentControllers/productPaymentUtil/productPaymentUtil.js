import moment from "moment";
import "dotenv/config";
import { sendMailUtil } from "../../../utils/sendEmail.js";
import dotenv from "dotenv";
import { uploadArrayOfFilesToCloudinary } from "../../../helper/uploadToCloudinary.js";
import { createShipyaariDraftOrder } from "../../../services/shipyaariIntegration.js";
import { readRecord } from "../../../config/query.js";
import { tables } from "../../../helper/constant.js";
import { generateOrderConfirmationEmail } from "../../../helper/emailAutochatTemplateHelpers/getProductOrderConfirmationEmail.js";
import { getComboInclusions, isComboProduct } from "../../../helper/commonHelper.js";
dotenv.config();

import fs from "fs";
import path from "path";
import axios from "axios";
import PDFDocument from "pdfkit";

const INR = (n) => `₹${Number(n).toFixed(2)}`;


const getFinancialYear = () => {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();

  // Financial year starts in April (month 3)
  if (month >= 3) { // April to December
    const currentYearShort = year.toString().slice(-2);
    const nextYearShort = (year + 1).toString().slice(-2);
    return `${currentYearShort}-${nextYearShort}`;
  } else { // January to March
    const prevYearShort = (year - 1).toString().slice(-2);
    const currentYearShort = year.toString().slice(-2);
    return `${prevYearShort}-${currentYearShort}`;
  }
};

const generateMasterOrderId = async (orderType) => {
  const today = moment().format("YYYYMMDD");
  const { results } = await readRecord({
    table: tables.product_orders,
    selectFields: ["master_order_id"],
    pagination: { page: 1, limit: 1 },
    conditions: [
      { field: 'master_order_id', operator: 'IS NOT', value: "NULL", raw: true },
      { field: "payment_method", operator: "=", value: orderType },
      {
        orConditions: [
          {
            field: "hamper_type",
            operator: "IS",
            value: "NULL",
            raw: true
          },
          { field: "IFNULL(hamper_type, '')", operator: "!=", value: "'zero-order'", raw: true },
        ],
      },
    ],
    orderBy: ["order_id DESC"],
  });

  const lastId = results[0]?.master_order_id;
  const lastCount = lastId ? Number(lastId.split("/").pop()) : 0;
  const financialYear = getFinancialYear();
  const orderNumber = orderType === 'free'
    ? `BN-F/${financialYear}/${lastCount + 1}`
    : `BN-OD/${financialYear}/${lastCount + 1}`;

  return orderNumber;


}

const generateProductOrderId = async (brand, payment_method) => {
  if (brand === "kilobeaters") {
    const { results } = await readRecord({
      table: tables.product_orders,
      selectFields: ["product_order_id"],
      pagination: { page: 1, limit: 1 },
      conditions: [
        { field: "brand", operator: "=", value: "kilobeaters" },
        { field: "payment_method", operator: "=", value: payment_method },
        {
          orConditions: [
            {
              field: "hamper_type",
              operator: "IS",
              value: "NULL",
              raw: true
            },
            { field: "IFNULL(hamper_type, '')", operator: "!=", value: "'zero-order'", raw: true },
          ],
        },
      ],
      orderBy: ["order_id DESC"],
    });

    const lastId = results[0]?.product_order_id;
    const lastCount = lastId ? Number(lastId.split("/").pop()) : 0;
    const financialYear = getFinancialYear();
    return payment_method === 'online' ? `KBN/${financialYear}/${lastCount + 1}` : `KBN/${financialYear}/FREE/${lastCount + 1}`;
  }
  if (brand === "doctorstore") {
    const year = moment().format("YYYY");
    const { results } = await readRecord({
      table: `${tables.product_orders}`,
      selectFields: ["product_order_id"],
      pagination: { page: 1, limit: 1 },
      conditions: [
        { field: "brand", operator: "=", value: "doctorstore" },
        { field: "payment_method", operator: "=", value: payment_method },
      ],
      orderBy: ["order_id DESC"],
    });

    const lastId = results[0]?.product_order_id;
    const lastCount = lastId ? Number(lastId.split("/").pop()) : 0;
    const financialYear = getFinancialYear();
    if (process.env.NODE_ENV == "development") {
      return payment_method === 'online' ? `DS/${financialYear}/${lastCount + 1}` : `DS/${financialYear}/FREE/${lastCount + 1}`;
    }
    return payment_method === 'online' ? `BN-DR/${financialYear}/${lastCount + 1}` : `BN-DR/${financialYear}/FREE/${lastCount + 1}`;
  }

  throw new Error(`Unsupported brand: ${brand}`);
};

const generateInvoicePDF = async (orderData, items, master_order_id, brand = 'general') => {
  try {
    const {
      customer_name,
      customer_address,
      customer_city,
      customer_state,
      customer_country,
      customer_pincode,
      customer_landmark,
      customer_phone,
      product_order_id: productOrderId,
      payment_method,
    } = orderData;


    console.log("generateInvoicePDF", orderData);


    let orderId = productOrderId;

    if (brand === 'kb') {
      orderId = productOrderId
    }

    // Totals - handle zero/negative values
    const gstRate = brand === 'kb' ? 0.05 : 0.18;
    const grandTotal = Math.max(0, items.reduce(
      (s, i) => s + Number(i.total_price || 0),
      0
    ));
    const gstAmount = grandTotal > 0 ? grandTotal - grandTotal / (1 + gstRate) : 0;
    const subtotal = grandTotal - gstAmount;
    const isZeroInvoice = grandTotal === 0;

    // Calculate total discount for zero invoices (doctorstore brand)
    // Using hardcoded original price of 1299 for zero invoice items
    const ZERO_INVOICE_ORIGINAL_PRICE = 2999;
    const totalDiscount = isZeroInvoice && brand !== 'kb' && brand !== 'kilobeaters'
      ? items.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        return sum + (ZERO_INVOICE_ORIGINAL_PRICE * quantity);
      }, 0)
      : 0;

    // Load images once
    let logoBuffer = null,
      signBuffer = null;
    try {
      const logoResp = await axios.get(
        "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1761215493/app_images/hnd6vnpt1frodp5etyio.png",
        { responseType: "arraybuffer" }
      );
      logoBuffer = Buffer.from(logoResp.data);
    } catch (err) {
      console.error("Logo load failed:", err.message);
    }

    try {
      const imageUrl = brand === 'kb'
        ? "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1761561364/app_images/qkmwj08jtllfx2n0irpi.png"
        : "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1770286925/signature_gxa9sf.png";

      console.log('imageUrl', imageUrl);

      const signResp = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });

      signBuffer = Buffer.from(signResp.data);

    } catch (err) {
      console.error("Signature load failed:", err.message);
      signBuffer = null; // or some default value
    }

    // Create PDF with Promise wrapper
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Constants
      const margin = 40;
      const pageWidth = doc.page.width - margin * 2;
      const pageHeight = doc.page.height; // 841.89 for A4
      const footerY = 780;
      const bottomLimit = 730; // Content must stay above this
      const rowH = 30;
      const rowH_combo = 50; // Increased height for combo products

      // Define columns based on brand and invoice type
      const cols = brand !== 'kb' && brand !== 'kilobeaters' && isZeroInvoice ? [
        { label: "Product Name", w: 165, align: "center" },
        { label: "Pack Size", w: 65, align: "center" },
        { label: "Qty", w: 45, align: "center" },
        { label: "Price/Unit", w: 80, align: "center" },
        { label: "Discount", w: 80, align: "center" },
        { label: "Total", w: 80, align: "center" },
      ] : [
        { label: "Product Name", w: 210, align: "center" },
        { label: "Pack Size", w: 80, align: "center" },
        { label: "Qty", w: 60, align: "center" },
        { label: "Price/Unit", w: 95, align: "center" },
        { label: "Total", w: 95, align: "center" },
      ];

      const tableX = margin;
      const tableWidth = cols.reduce((a, c) => a + c.w, 0);
      const cellPad = 6;

      // Draw footer at fixed position
      const drawFooter = () => {
        doc
          .fontSize(9)
          .fillColor("#666")
          .text(
            "Balance Nutrition | Website: www.balancenutrition.in | Email: accounts@balancenutrition.in | Contact: +91-9158267868",
            margin,
            footerY,
            { align: "center", width: pageWidth }
          );
        doc.fillColor("#000");
      };

      // Draw product table header, returns Y position after header
      const drawTableHeader = (yPos) => {
        doc.save();
        doc.rect(tableX, yPos, tableWidth, rowH).fill("#f2f2f2").stroke();
        doc.restore();
        let x = tableX;
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
        cols.forEach((c) => {
          doc.text(c.label, x + cellPad, yPos + (rowH / 2 - 5), {
            width: c.w - cellPad * 2,
            align: c.align,
          });
          x += c.w;
        });
        doc.rect(tableX, yPos, tableWidth, rowH).stroke();
        for (let i = 1; i < cols.length; i++) {
          const lineX = tableX + cols.slice(0, i).reduce((a, c) => a + c.w, 0);
          doc
            .moveTo(lineX, yPos)
            .lineTo(lineX, yPos + rowH)
            .stroke();
        }
        return yPos + rowH;
      };

      // Add new page with header and table header, returns new Y
      const addNewPage = () => {
        doc.addPage();
        if (logoBuffer) doc.image(logoBuffer, 440, 30, { width: 110 });
        doc
          .font("Helvetica-Bold")
          .fontSize(18)
          .text("INVOICE (Continued)", margin, 40);
        return drawTableHeader(100); // Start table at Y=100
      };

      // === PAGE 1 HEADER ===
      if (logoBuffer) doc.image(logoBuffer, 440, 30, { width: 110 });

      // Title - indicate if zero invoice
      const invoiceTitle = isZeroInvoice && (brand === 'kilobeaters' || brand === 'kb') ? "INVOICE (Zero Value)" : "INVOICE";
      doc.font("Helvetica-Bold").fontSize(18).text(invoiceTitle, margin, 40);
      doc.moveDown(1.2);

      // Seller Info
      if (brand === 'kb') {
        doc
          .font("Helvetica")
          .fontSize(10)
          .text("Order Fulfilled & Tax Invoiced By:", margin)
          .font("Helvetica-Bold")
          .text("Kilobeaters-Bespoke Meals Private Limited - MH")
          .font("Helvetica")
          .text("GSTIN: 27AAKCK5983H1ZY")
          .text(
            "Address: S.No. 30/8, Shree Rushikesh Heights, Narhe Dhayari Road, Dhayri, Pune 411041, Maharashtra"
          )
          .moveDown(1.5);
      }
      else {
        doc
          .font("Helvetica")
          .fontSize(10)
          .text("Order Fulfilled & Tax Invoiced By:", margin)
          .font("Helvetica-Bold")
          .text("DRSTORE HEALTHCARE SERVICES INDIA PRIVATE LTD")
          .font("Helvetica")
          .text(
            "GSTIN/UIN: 27AAFCD4353H3ZM"
          )
          .text("2ND FLOOR, Shop no SA/44,, Lake city Mall, G B road, Kapurbawadi Thane, Maharashtra, 400607")
          .text("State Name : Maharashtra, Code : 27")
          .moveDown(1.5);

      }

      // Customer Details
      doc.font("Helvetica-Bold").fontSize(11).text("Customer Details:", margin);
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`Name: ${customer_name}`)
        .text(
          `Address: ${customer_address}, ${customer_city}, ${customer_state}, ${customer_country} - ${customer_pincode}`
        )
        .text(`Landmark: ${customer_landmark || "-"}`)
        .text(`Contact: ${customer_phone || "-"}`)
        .moveDown(1.3);

      doc.font("Helvetica-Bold").fontSize(11).text("Invoice Details:", margin);
      const invTableTop = doc.y + 6;
      const numCols = 5; // Changed from 4 to 5
      const colWidth = pageWidth / numCols;
      const invTableW = colWidth * numCols;

      doc.save();
      doc.rect(margin, invTableTop, invTableW, rowH).fill("#f2f2f2").stroke();
      doc.restore();
      doc.rect(margin, invTableTop, invTableW, rowH * 2).stroke();
      doc
        .moveTo(margin, invTableTop + rowH)
        .lineTo(margin + invTableW, invTableTop + rowH)
        .stroke();
      for (let i = 1; i < numCols; i++) {
        const x = margin + i * colWidth;
        doc
          .moveTo(x, invTableTop)
          .lineTo(x, invTableTop + rowH * 2)
          .stroke();
      }

      const headers = [
        "Master Order ID",
        "Invoice No",
        "Invoice Date",
        "Order ID",
        "Payment Mode",
      ];
      const values = [
        `${master_order_id}`,
        `${productOrderId}`,
        moment().format("DD/MM/YYYY"),
        `#${productOrderId}`,
        String(payment_method || "-").toUpperCase(),
      ];

      headers.forEach((h, i) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(h, margin + i * colWidth, invTableTop + (rowH / 2 - 5), {
            width: colWidth,
            align: "center",
          });
      });
      values.forEach((v, i) => {
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(v, margin + i * colWidth, invTableTop + rowH + (rowH / 2 - 5), {
            width: colWidth,
            align: "center",
          });
      });

      doc.y = invTableTop + rowH * 2 + 14;

      // Products Ordered
      doc.font("Helvetica-Bold").fontSize(11).text("Products Ordered:", margin);
      let y = drawTableHeader(doc.y + 5);
      let needsFooterOnCurrentPage = true;

      // Product Rows with page break handling
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];

        // Check if product is a combo
        const isCombo = isComboProduct(item.product_name);
        const currentRowHeight = isCombo ? rowH_combo : rowH;

        // Check if we need a new page BEFORE drawing this row
        if (y + currentRowHeight > bottomLimit) {
          drawFooter();
          needsFooterOnCurrentPage = false;
          y = addNewPage();
          needsFooterOnCurrentPage = true;
        }

        // For zero invoices, use hardcoded original price of 1300
        const ZERO_INVOICE_ORIGINAL_PRICE = 2999;
        const originalPrice = isZeroInvoice && brand !== 'kb' && brand !== 'kilobeaters'
          ? ZERO_INVOICE_ORIGINAL_PRICE
          : (Number(item.price_per_unit) || 0);

        const totalPrice = Number(item.total_price) || 0;
        const quantity = Number(item.quantity) || 0;
        const discountAmount = isZeroInvoice && brand !== 'kb' && brand !== 'kilobeaters' ? ZERO_INVOICE_ORIGINAL_PRICE * quantity : 0;

        // Draw the row rectangle
        doc.rect(tableX, y, tableWidth, currentRowHeight).stroke();

        // Draw vertical lines for columns
        for (let i = 1; i < cols.length; i++) {
          const lineX = tableX + cols.slice(0, i).reduce((a, c) => a + c.w, 0);
          doc
            .moveTo(lineX, y)
            .lineTo(lineX, y + currentRowHeight)
            .stroke();
        }

        let xPos = tableX;

        // Column 0: Product Name (with inclusions if combo)
        if (isCombo) {
          const inclusions = getComboInclusions(item.product_name, item.pack_size);

          // Draw product name
          doc
            .font("Helvetica")
            .fontSize(10)
            .text(item.product_name || "-", xPos + cellPad, y + 8, {
              width: cols[0].w - cellPad * 2,
              align: cols[0].align,
            });

          // Draw inclusions in smaller italic font
          if (inclusions && inclusions.length > 0) {
            const inclusionsText = `Inclusions: ${inclusions.join(", ")}`;
            doc
              .font("Helvetica-Oblique")
              .fontSize(7)
              .fillColor("#555")
              .text(inclusionsText, xPos + cellPad, y + 24, {
                width: cols[0].w - cellPad * 2,
                align: "left",
              });
            doc.fillColor("#000"); // Reset color
          }
        } else {
          // Regular product (no combo)
          doc
            .font("Helvetica")
            .fontSize(10)
            .text(item.product_name || "-", xPos + cellPad, y + (currentRowHeight / 2 - 5), {
              width: cols[0].w - cellPad * 2,
              align: cols[0].align,
            });
        }
        xPos += cols[0].w;

        // Column 1: Pack Size
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(item.pack_size || "-", xPos + cellPad, y + (currentRowHeight / 2 - 5), {
            width: cols[1].w - cellPad * 2,
            align: cols[1].align,
          });
        xPos += cols[1].w;

        // Column 2: Quantity
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(item.quantity || "0", xPos + cellPad, y + (currentRowHeight / 2 - 5), {
            width: cols[2].w - cellPad * 2,
            align: cols[2].align,
          });
        xPos += cols[2].w;

        // Column 3: Price/Unit
        doc
          .font("Helvetica")
          .fontSize(10)
          .text("Rs." + originalPrice.toFixed(2), xPos + cellPad, y + (currentRowHeight / 2 - 5), {
            width: cols[3].w - cellPad * 2,
            align: cols[3].align,
          });
        xPos += cols[3].w;

        // Column 4: Discount (only for zero invoices with non-kb/non-kilobeaters brand)
        if (brand !== 'kb' && brand !== 'kilobeaters' && isZeroInvoice) {
          doc
            .font("Helvetica")
            .fontSize(10)
            .text("Rs." + discountAmount.toFixed(2), xPos + cellPad, y + (currentRowHeight / 2 - 5), {
              width: cols[4].w - cellPad * 2,
              align: cols[4].align,
            });
          xPos += cols[4].w;
        }

        // Column 5 (or 4 if no discount): Total
        const totalColIndex = brand !== 'kb' && brand !== 'kilobeaters' && isZeroInvoice ? 5 : 4;
        doc
          .font("Helvetica")
          .fontSize(10)
          .text("Rs." + totalPrice.toFixed(2), xPos + cellPad, y + (currentRowHeight / 2 - 5), {
            width: cols[totalColIndex].w - cellPad * 2,
            align: cols[totalColIndex].align,
          });

        y += currentRowHeight;
      }

      // Summary Section
      const rowH_summary = 24;

      // Build summary rows based on brand and invoice type
      const summaryRows = brand !== 'kb' && brand !== 'kilobeaters' && isZeroInvoice ? [
        ["Sub Total: ", "Rs." + (0).toFixed(2)],
        [`GST (${gstRate * 100}%): `, "Rs." + (0).toFixed(2)],
        ["Grand Total: ", "Rs." + (0).toFixed(2)],
      ] : [
        ["Sub Total: ", "Rs." + subtotal.toFixed(2)],
        [`GST (${gstRate * 100}%): `, "Rs." + gstAmount.toFixed(2)],
        ["Grand Total: ", "Rs." + grandTotal.toFixed(2)],
      ];

      const summaryHeight = rowH_summary * summaryRows.length;
      const signatureHeight = 100;
      const totalNeeded = summaryHeight + signatureHeight;

      // Check if summary + signature fits
      if (y + totalNeeded > bottomLimit) {
        drawFooter();
        doc.addPage();
        if (logoBuffer) doc.image(logoBuffer, 440, 30, { width: 110 });
        doc
          .font("Helvetica-Bold")
          .fontSize(18)
          .text("INVOICE (Continued)", margin, 40);
        y = 100;
        needsFooterOnCurrentPage = true;
      }

      // Calculate summary table dimensions based on whether discount column exists
      const labelColWidth = brand !== 'kb' && brand !== 'kilobeaters' && isZeroInvoice
        ? cols.slice(0, 5).reduce((sum, c) => sum + c.w, 0)  // Include discount column
        : cols.slice(0, 4).reduce((sum, c) => sum + c.w, 0); // No discount column

      const valueColWidth = brand !== 'kb' && brand !== 'kilobeaters' && isZeroInvoice ? cols[5].w : cols[4].w;
      const summaryWidth = labelColWidth + valueColWidth;

      doc.rect(tableX, y, summaryWidth, summaryHeight).stroke();
      for (let i = 1; i < summaryRows.length; i++) {
        doc
          .moveTo(tableX, y + i * rowH_summary)
          .lineTo(tableX + summaryWidth, y + i * rowH_summary)
          .stroke();
      }
      doc
        .moveTo(tableX + labelColWidth, y)
        .lineTo(tableX + labelColWidth, y + summaryHeight)
        .stroke();

      summaryRows.forEach(([label, value], i) => {
        const rowY = y + i * rowH_summary + 6;
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(label, tableX + 8, rowY, {
            width: labelColWidth - 16,
            align: "left",
          });
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(value, tableX + labelColWidth + 6, rowY, {
            width: valueColWidth - 12,
            align: "center",
          });
      });

      y += summaryHeight + 8;
      doc.y = y;

      // Payment Confirmation - adjust for zero invoice
      if (isZeroInvoice) {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("Payment Status: ", margin, doc.y, { continued: true });
        doc
          .font("Helvetica")
          .fontSize(11)
          .text("This is a zero-value invoice. No payment is required.");
      } else {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("Payment Confirmation: ", margin, doc.y, { continued: true });

        doc
          .font("Helvetica")
          .fontSize(11)
          .text(`We have received the payment for the above order.`);
      }

      if (brand != 'kb') {
        doc
          .font("Helvetica")
          .text("We'll deliver your order within ", { continued: true })
          .font("Helvetica-Bold")
          .text("14 working days", { continued: true })
          .font("Helvetica")
          .text(". Thank you for your patience!").font('Helvetica-Bold').text('Warranty:', { continued: true }).font('Helvetica').text('1 Year Replacement Warranty from the date of invoice.')

        doc.moveDown(2);
      }

      // Authorized Signatory
      if (brand === 'kb') {
        doc
          .font("Helvetica-Bold")
          .text("For Kilobeaters-Bespoke Meals Private Limited - MH", margin)
          .moveDown(1);

        if (signBuffer) {
          const signY = doc.y;
          doc.image(signBuffer, margin, signY, { width: 120 });
          doc.y = signY + 70;
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .text("Authorized Signatory", margin);
        } else {
          doc.moveDown(3);
          doc.font("Helvetica").text("Authorized Signatory", margin);
        }
      }
      else {
        doc
          .font("Helvetica-Bold")
          .text("For", margin)
          .moveDown(1);
        const signY = doc.y;
        doc.font("Helvetica-Bold").fontSize(12).text('DRSTORE HEALTHCARE SERVICES INDIA PRIVATE LTD')
        doc.y = signY + 20; // Reduced from 70 to 40 - adjust as needed
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("Authorized Signatory", margin);
      }

      // Draw footer on final page
      drawFooter();
      doc.end();
    });

    // Upload to Cloudinary
    let uploadResult;
    try {
      uploadResult = await uploadArrayOfFilesToCloudinary(
        [
          {
            buffer: pdfBuffer,
            mimetype: "application/pdf",
            originalname: `Invoice_${productOrderId}.pdf`,
          },
        ],
        "invoices",
        `Invoice_${productOrderId}`
      );
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      return { success: false, error: "Cloudinary upload failed" };
    }

    const invoiceLink = uploadResult?.[0]?.file?.path;

    console.log(invoiceLink, 'generateInvoicePDF');

    return {
      success: true,
      invoiceLink,
      pdfBuffer,
      subtotal: +subtotal.toFixed(2),
      gstAmount: +gstAmount.toFixed(2),
      grandTotal: +grandTotal.toFixed(2),
      totalDiscount: +totalDiscount.toFixed(2),
      isZeroInvoice,
    };
  } catch (err) {
    console.error("FATAL PDF GENERATION ERROR:", err);
    return { success: false, error: err.message };
  }
};

const sendOrderConfirmEmail = async (
  orderData,
  masterOrderId,
  razorpay_payment_id,
  assignedEmail,
  items,
  attachmentInfo,
  grandTotal,
  brand = 'general'
) => {
  try {
    let emailConfig;
    const attachments = [];
    let subject;

    // Configure attachments based on email type
    if (brand === 'kb_mixed') {
      // KB internal email - only KB invoice
      if (attachmentInfo.kbPdfBuffer) {
        attachments.push({
          filename: `Invoice_${attachmentInfo.kbOrderId ?? "KB"}.pdf`,
          content: attachmentInfo.kbPdfBuffer,
          contentType: "application/pdf",
        });
      }
    } else {
      // Client email or KB-only email - include all available invoices
      if (attachmentInfo.kbPdfBuffer) {
        attachments.push({
          filename: `Invoice_${attachmentInfo.kbOrderId ?? "KB"}.pdf`,
          content: attachmentInfo.kbPdfBuffer,
          contentType: "application/pdf",
        });
      }

      if (attachmentInfo.drStorePdfBuffer) {
        attachments.push({
          filename: `Invoice_${attachmentInfo.drStoreOrderId ?? "DR_STORE"}.pdf`,
          content: attachmentInfo.drStorePdfBuffer,
          contentType: "application/pdf",
        });
      }
    }
    // Configure email recipients based on brand/scenario
    if (brand === 'only_kb') {
      // KB only order: Send to client + Shyama Kilobeaters
      emailConfig = {
        to: orderData.customer_email || 'accounts@balancenutrition.in',
        cc: [
          "shyma@kilobeaters.com",
          "kishan@kilobeaters.com",
          "ram@kilobeaters.com",
          "rishabh@kilobeaters.com",
          "suyash@kilobeaters.com",
          "khyati.rupani@balancenutrition.in",
          assignedEmail || "accounts@balancenutrition.in",
        ],
      };
      subject = orderData.staff_order == 0
        ? `Order Confirmation - ${attachmentInfo.kbOrderId}`
        : `BN Staff Order Confirmation - ${attachmentInfo.kbOrderId}`;

    } else if (brand === 'kb_mixed') {
      // Mixed order - KB internal email: Send to KB team + BN stakeholders only (NO CLIENT)
      emailConfig = {
        to: "shyma@kilobeaters.com",
        cc: [
          "kishan@kilobeaters.com",
          "ram@kilobeaters.com",
          "rishabh@kilobeaters.com",
          "suyash@kilobeaters.com",
          "khyati.rupani@balancenutrition.in",
          assignedEmail || "accounts@balancenutrition.in",
        ],
      };

      subject = orderData.staff_order == 0
        ? `Order Confirmation - ${attachmentInfo.kbOrderId}`
        : `BN Staff Order Confirmation - ${attachmentInfo.kbOrderId}`;
    } else {
      // Default/general: Client + BN stakeholders with all products
      emailConfig = {
        to: orderData.customer_email || "support@balancenutrition.in",
        cc: [
          "khyati.rupani@balancenutrition.in",
          assignedEmail || "accounts@balancenutrition.in",
          "support@balancenutrition.in",
        ],
      };

      subject = orderData.staff_order == 0
        ? `Order Confirmation - ${masterOrderId}`
        : `BN Staff Order Confirmation - ${masterOrderId}`;
    }

    console.log("attachments", attachments, emailConfig);

    await sendMailUtil({
      from: `Support <support@balancenutrition.in>`,
      ...emailConfig,
      bcc: [
        "kushal.agrawal@balancenutrition.in",
        "accounts@balancenutrition.in",
      ],
      subject: subject,

      html: generateOrderConfirmationEmail(orderData, masterOrderId, razorpay_payment_id, items, grandTotal, attachments).html,
      attachments,
    });
    console.log(`✅ Email sent successfully for Order: ${orderId}`);
  } catch (err) {
    console.log("Error in sending email", err);
  }
};

const createShipyaariOrder = async (orderData, items) => {
  try {
    if (!items || items.length === 0) return { success: false, awb_number: "" };

    const invoiceValue = items.reduce(
      (sum, item) => sum + Number(item.price_per_unit) * item.quantity,
      0
    );

    const shipyaariPayload = {
      orderId: orderData.product_order_id,
      pickupDetails: {
        fullAddress:
          "KILOBEATERS BESPOKE MEALS PRIVATE LIMITED, 30/8 SHREE RISHIKESH HEIGHTS, NARHE, Pune, Maharashtra, 411041",
        pincode: 411041,
        contact: {
          name: "kilobeaters bn",
          mobileNo: "9689479997", // warehouse number
        },
      },

      deliveryDetails: {
        fullAddress: orderData.customer_address,
        pincode: Number(orderData.customer_pincode),
        contact: {
          name: orderData.customer_name,
          mobileNo: orderData.customer_phone,
        },
      },

      boxInfo: [
        {
          name: orderData.product_order_id,
          type: "parcel",
          weightUnit: "Kg",
          deadWeight: 0.5,
          length: 10,
          breadth: 10,
          height: 15,
          qty: 1,
          measureUnit: "cm",

          products: items.map((item) => ({
            name: item.product_name + " (" + item.pack_size + ")",
            category: "Food",
            sku: item.product_code,
            hsnCode: "210690",
            qty: item.quantity,
            unitPrice: Number(item.price_per_unit),
            unitTax: 0,
            weightUnit: "Kg",
            deadWeight: 0.5 / items.length,
            length: 10,
            breadth: 10,
            height: 15,
            measureUnit: "cm",
          })),

          codInfo: {
            isCod: false,
            collectableAmount: 0,
            invoiceValue,
          },

          podInfo: {
            isPod: false,
          },

          insurance: false,
        },
      ],

      orderType: "B2C",
      transit: "FORWARD",
      servicePriority: "cheapest",
      invoiceNumber: orderData.invoice_number,
    };

    console.log("hello whatsup");
    const shipyaariResponse = await createShipyaariDraftOrder(shipyaariPayload);

    console.log(shipyaariResponse, 'helloooooo we have this');

    if (shipyaariResponse?.success) {
      return {
        success: true,
        awb_number:
          shipyaariResponse?.data[0]?.awbs[0]?.tracking?.awb || "",
      };
    }
    return {
      success: false,
      awb_number: "",
    };
  } catch (err) {
    console.error("❌ Shipyaari API Error:", err.response?.data || err.message);
    return { success: false, awb_number: "" };
  }
};


export {
  generateInvoicePDF,
  createShipyaariOrder,
  sendOrderConfirmEmail,
  generateProductOrderId,
  generateMasterOrderId
}