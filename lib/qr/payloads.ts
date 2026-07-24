import type { QrFormState, QrType } from "@/lib/qr/types";

function encodeQueryValue(value: string) {
  return encodeURIComponent(value);
}
function buildQuery(entries: Array<[string, string]>) {
  const query = entries
    .filter(([, value]) => value.trim() !== "")
    .map(([key, value]) => `${key}=${encodeQueryValue(value)}`)
    .join("&");
  return query ? `?${query}` : "";
}

export function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("unsupported-protocol");
  }
  if (!parsed.hostname) throw new Error("missing-hostname");
  return parsed.toString();
}

export function normalizePhoneNumber(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}

export function escapeWifiValue(value: string) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([;,])/g, "\\$1");
}

export function buildQrPayload(type: QrType, form: QrFormState) {
  switch (type) {
    case "text":
      return form.text;
    case "url":
      return normalizeWebsiteUrl(form.url);
    case "email":
      return `mailto:${form.email.trim()}${buildQuery([
        ["subject", form.emailSubject],
        ["body", form.emailBody],
      ])}`;
    case "phone":
      return `tel:${normalizePhoneNumber(form.phone)}`;
    case "sms":
      return `sms:${normalizePhoneNumber(form.smsPhone)}${buildQuery([
        ["body", form.smsMessage],
      ])}`;
    case "wifi": {
      const password = form.wifiSecurity === "nopass"
        ? ""
        : `P:${escapeWifiValue(form.wifiPassword)};`;
      return `WIFI:T:${form.wifiSecurity};S:${escapeWifiValue(form.wifiSsid)};${password}H:${form.wifiHidden ? "true" : "false"};;`;
    }
    case "vcard": {
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${escapeVCardValue(form.vcardFullName.trim())}`,
      ];
      if (form.vcardOrganization.trim()) {
        lines.push(`ORG:${escapeVCardValue(form.vcardOrganization.trim())}`);
      }
      if (form.vcardTitle.trim()) {
        lines.push(`TITLE:${escapeVCardValue(form.vcardTitle.trim())}`);
      }
      if (form.vcardPhone.trim()) {
        lines.push(`TEL;TYPE=CELL:${escapeVCardValue(normalizePhoneNumber(form.vcardPhone))}`);
      }
      if (form.vcardEmail.trim()) {
        lines.push(`EMAIL:${escapeVCardValue(form.vcardEmail.trim())}`);
      }
      if (form.vcardWebsite.trim()) {
        lines.push(`URL:${escapeVCardValue(normalizeWebsiteUrl(form.vcardWebsite))}`);
      }
      if (form.vcardAddress.trim()) {
        lines.push(`ADR;TYPE=HOME:;;${escapeVCardValue(form.vcardAddress.trim())};;;;`);
      }
      lines.push("END:VCARD");
      return lines.join("\r\n");
    }
  }
}
