import crypto from "crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";

export async function getMidtransConfig() {
  const setting = await prisma.systemSetting.findUnique({
    where: { id: "global_config" },
    select: {
      midtransServerKey: true,
      midtransClientKey: true,
      midtransIsProduction: true,
    },
  });

  const serverKey = setting?.midtransServerKey || process.env.MIDTRANS_SERVER_KEY || "";
  const clientKey = setting?.midtransClientKey || process.env.MIDTRANS_CLIENT_KEY || "";
  const isProduction = setting?.midtransIsProduction ?? (process.env.MIDTRANS_IS_PRODUCTION === "true");

  const coreBase = isProduction
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

  const snapBase = isProduction
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;

  return {
    serverKey,
    clientKey,
    isProduction,
    coreBase,
    snapBase,
    authHeader,
  };
}

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
  serverKey: string
): boolean {
  if (!serverKey || serverKey.includes("xxxxxxxx")) return true;
  const hash = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
  return hash === signatureKey;
}

// 1. Direct Core API: Charge QRIS
export async function createDirectQrisCharge(params: {
  orderId: string;
  grossAmount: number;
  customerDetails: {
    first_name: string;
    email: string;
  };
}) {
  const config = await getMidtransConfig();

  const payload = {
    payment_type: "qris",
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.grossAmount,
    },
    customer_details: params.customerDetails,
    qris: {
      acquirer: "gopay",
    },
  };

  const res = await fetch(`${config.coreBase}/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: config.authHeader,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  
  let qrImageBase64: string | null = null;
  let qrString: string | null = data.qr_string || null;

  if (data.qr_string) {
    qrImageBase64 = await QRCode.toDataURL(data.qr_string, { width: 240, margin: 1 });
  } else if (data.actions && Array.isArray(data.actions)) {
    const qrAction = data.actions.find((a: any) => a.name === "generate-qr-code");
    if (qrAction?.url) {
      qrImageBase64 = qrAction.url;
    }
  }

  return {
    raw: data,
    qrString,
    qrImageBase64,
    transactionId: data.transaction_id || null,
    transactionStatus: data.transaction_status || "pending",
  };
}

// 2. Direct Core API: Charge Bank Virtual Account
export async function createDirectVaCharge(params: {
  orderId: string;
  grossAmount: number;
  bank?: "bca" | "bni" | "bri" | "permata" | "echannel";
  customerDetails: {
    first_name: string;
    email: string;
  };
}) {
  const config = await getMidtransConfig();
  const bank = params.bank || "bca";

  let payload: any = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.grossAmount,
    },
    customer_details: params.customerDetails,
  };

  if (bank === "echannel") {
    payload.payment_type = "echannel";
    payload.echannel = {
      bill_info1: "Payment For:",
      bill_info2: "AI Token Credit",
    };
  } else if (bank === "permata") {
    payload.payment_type = "permata";
  } else {
    payload.payment_type = "bank_transfer";
    payload.bank_transfer = {
      bank: bank,
    };
  }

  const res = await fetch(`${config.coreBase}/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: config.authHeader,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  let vaNumber: string | null = null;
  if (data.va_numbers && data.va_numbers.length > 0) {
    vaNumber = data.va_numbers[0].va_number;
  } else if (data.permata_va_number) {
    vaNumber = data.permata_va_number;
  } else if (data.bill_key) {
    vaNumber = `${data.biller_code} - ${data.bill_key}`;
  }

  return {
    raw: data,
    vaNumber,
    bank: bank.toUpperCase(),
    transactionId: data.transaction_id || null,
    transactionStatus: data.transaction_status || "pending",
  };
}
