export const QR_TYPES = [
  { value: "text", label: "Text", icon: "TXT" },
  { value: "url", label: "Website", icon: "URL" },
  { value: "email", label: "Email", icon: "@" },
  { value: "phone", label: "Phone", icon: "TEL" },
  { value: "sms", label: "SMS", icon: "SMS" },
  { value: "wifi", label: "Wi-Fi", icon: "WiFi" },
  { value: "vcard", label: "Contact", icon: "VCF" },
] as const;

export type QrType = (typeof QR_TYPES)[number]["value"];
export type QrErrorCorrection = "L" | "M" | "Q" | "H";
export type WifiSecurity = "WPA" | "WEP" | "nopass";

export type QrFormState = {
  text: string;
  url: string;
  email: string;
  emailSubject: string;
  emailBody: string;
  phone: string;
  smsPhone: string;
  smsMessage: string;
  wifiSsid: string;
  wifiSecurity: WifiSecurity;
  wifiPassword: string;
  wifiHidden: boolean;
  vcardFullName: string;
  vcardOrganization: string;
  vcardTitle: string;
  vcardPhone: string;
  vcardEmail: string;
  vcardWebsite: string;
  vcardAddress: string;
};
export type QrSettings = {
  size: number;
  margin: number;
  foreground: string;
  background: string;
  errorCorrection: QrErrorCorrection;
};

export type QrField = Exclude<keyof QrFormState, "wifiHidden" | "wifiSecurity">;
export type QrValidationErrors = Partial<Record<QrField, string>>;

export type QrValidationResult =
  | { valid: true; payload: string; errors: QrValidationErrors }
  | { valid: false; payload: null; errors: QrValidationErrors };

export type QrAssets = {
  svg: string;
  png: Blob;
};

export const EMPTY_QR_FORM: QrFormState = {
  text: "",
  url: "",
  email: "",
  emailSubject: "",
  emailBody: "",
  phone: "",
  smsPhone: "",
  smsMessage: "",
  wifiSsid: "",
  wifiSecurity: "WPA",
  wifiPassword: "",
  wifiHidden: false,
  vcardFullName: "",
  vcardOrganization: "",
  vcardTitle: "",
  vcardPhone: "",
  vcardEmail: "",
  vcardWebsite: "",
  vcardAddress: "",
};

export const DEFAULT_QR_SETTINGS: QrSettings = {
  size: 320,
  margin: 4,
  foreground: "#111827",
  background: "#ffffff",
  errorCorrection: "M",
};
