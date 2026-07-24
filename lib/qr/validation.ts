import {
  buildQrPayload,
  normalizeWebsiteUrl,
} from "@/lib/qr/payloads";
import type {
  QrFormState,
  QrType,
  QrValidationErrors,
  QrValidationResult,
} from "@/lib/qr/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{3,30}$/;

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}
function isValidPhone(value: string) {
  return PHONE_PATTERN.test(value.trim());
}

function isValidWebsite(value: string) {
  try {
    normalizeWebsiteUrl(value);
    return true;
  } catch {
    return false;
  }
}

export function validateQrForm(
  type: QrType,
  form: QrFormState,
): QrValidationResult {
  const errors: QrValidationErrors = {};

  switch (type) {
    case "text":
      if (!form.text.trim()) errors.text = "Enter text to generate a QR code.";
      break;
    case "url":
      if (!form.url.trim()) errors.url = "Enter a website URL.";
      else if (!isValidWebsite(form.url)) {
        errors.url = "Enter a valid http or https website address.";
      }
      break;
    case "email":
      if (!form.email.trim()) errors.email = "Enter an email address.";
      else if (!isValidEmail(form.email)) {
        errors.email = "Enter a valid email address.";
      }
      break;
    case "phone":
      if (!form.phone.trim()) errors.phone = "Enter a phone number.";
      else if (!isValidPhone(form.phone)) {
        errors.phone = "Enter a valid phone number.";
      }
      break;
    case "sms":
      if (!form.smsPhone.trim()) errors.smsPhone = "Enter a phone number.";
      else if (!isValidPhone(form.smsPhone)) {
        errors.smsPhone = "Enter a valid phone number.";
      }
      break;
    case "wifi":
      if (!form.wifiSsid.trim()) {
        errors.wifiSsid = "Network name is required.";
      }
      if (form.wifiSecurity !== "nopass" && !form.wifiPassword) {
        errors.wifiPassword = "Enter the Wi-Fi password.";
      }
      break;
    case "vcard":
      if (!form.vcardFullName.trim()) {
        errors.vcardFullName = "Full name is required.";
      }
      if (form.vcardEmail.trim() && !isValidEmail(form.vcardEmail)) {
        errors.vcardEmail = "Enter a valid email address.";
      }
      if (form.vcardPhone.trim() && !isValidPhone(form.vcardPhone)) {
        errors.vcardPhone = "Enter a valid phone number.";
      }
      if (form.vcardWebsite.trim() && !isValidWebsite(form.vcardWebsite)) {
        errors.vcardWebsite = "Enter a valid http or https website address.";
      }
      break;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, payload: null, errors };
  }

  try {
    const payload = buildQrPayload(type, form);
    return payload
      ? { valid: true, payload, errors }
      : { valid: false, payload: null, errors };
  } catch {
    return { valid: false, payload: null, errors };
  }
}
