import type { ChangeEvent, TextareaHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type {
  QrFormState,
  QrType,
  QrValidationErrors,
  WifiSecurity,
} from "@/lib/qr/types";

type QrTypeFieldsProps = {
  type: QrType;
  form: QrFormState;
  errors: QrValidationErrors;
  onChange: <Field extends keyof QrFormState>(
    field: Field,
    value: QrFormState[Field],
  ) => void;
};

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

function TextareaField({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: TextareaFieldProps) {
  const descriptionId = `${id}-description`;
  return (
    <label className="input-field" htmlFor={id}>
      <span className="input-label">{label}</span>
      <textarea
        id={id}
        className={cn("input-control qr-textarea", error && "is-invalid", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={(hint || error) ? descriptionId : undefined}
        {...props}
      />
      {(hint || error) && (
        <span
          id={descriptionId}
          className={cn("input-hint", error && "is-error")}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
}
export function QrTypeFields({
  type,
  form,
  errors,
  onChange,
}: QrTypeFieldsProps) {
  if (type === "text") {
    return (
      <TextareaField
        id="qr-text"
        label="Text"
        rows={6}
        value={form.text}
        error={errors.text}
        placeholder="Enter text in English, Urdu, or another language"
        onChange={(event) => onChange("text", event.target.value)}
      />
    );
  }

  if (type === "url") {
    return (
      <Input
        id="qr-url"
        label="Website URL"
        type="url"
        inputMode="url"
        value={form.url}
        error={errors.url}
        hint="A domain without a protocol will use https://"
        placeholder="example.com"
        onChange={(event) => onChange("url", event.target.value)}
      />
    );
  }

  if (type === "email") {
    return (
      <div className="qr-field-stack">
        <Input
          id="qr-email"
          label="Email address"
          type="email"
          inputMode="email"
          value={form.email}
          error={errors.email}
          placeholder="name@example.com"
          onChange={(event) => onChange("email", event.target.value)}
        />
        <Input
          id="qr-email-subject"
          label="Subject (optional)"
          value={form.emailSubject}
          onChange={(event) => onChange("emailSubject", event.target.value)}
        />
        <TextareaField
          id="qr-email-body"
          label="Message (optional)"
          rows={4}
          value={form.emailBody}
          onChange={(event) => onChange("emailBody", event.target.value)}
        />
      </div>
    );
  }

  if (type === "phone") {
    return (
      <Input
        id="qr-phone"
        label="Phone number"
        type="tel"
        inputMode="tel"
        value={form.phone}
        error={errors.phone}
        placeholder="+1 555 123 4567"
        onChange={(event) => onChange("phone", event.target.value)}
      />
    );
  }

  if (type === "sms") {
    return (
      <div className="qr-field-stack">
        <Input
          id="qr-sms-phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          value={form.smsPhone}
          error={errors.smsPhone}
          placeholder="+1 555 123 4567"
          onChange={(event) => onChange("smsPhone", event.target.value)}
        />
        <TextareaField
          id="qr-sms-message"
          label="Message (optional)"
          rows={4}
          value={form.smsMessage}
          onChange={(event) => onChange("smsMessage", event.target.value)}
        />
      </div>
    );
  }

  if (type === "wifi") {
    return (
      <div className="qr-field-stack">
        <Input
          id="qr-wifi-ssid"
          label="Network name (SSID)"
          value={form.wifiSsid}
          error={errors.wifiSsid}
          autoComplete="off"
          onChange={(event) => onChange("wifiSsid", event.target.value)}
        />
        <label className="input-field" htmlFor="qr-wifi-security">
          <span className="input-label">Security type</span>
          <select
            id="qr-wifi-security"
            className="input-control"
            value={form.wifiSecurity}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => (
              onChange("wifiSecurity", event.target.value as WifiSecurity)
            )}
          >
            <option value="WPA">WPA / WPA2</option>
            <option value="WEP">WEP</option>
            <option value="nopass">No password</option>
          </select>
        </label>
        {form.wifiSecurity !== "nopass" && (
          <Input
            id="qr-wifi-password"
            label="Password"
            type="password"
            value={form.wifiPassword}
            error={errors.wifiPassword}
            autoComplete="new-password"
            onChange={(event) => onChange("wifiPassword", event.target.value)}
          />
        )}
        <label className="qr-checkbox">
          <input
            type="checkbox"
            checked={form.wifiHidden}
            onChange={(event) => onChange("wifiHidden", event.target.checked)}
          />
          <span>Hidden network</span>
        </label>
      </div>
    );
  }

  return (
    <div className="qr-vcard-grid">
      <Input
        id="qr-vcard-name"
        label="Full name"
        value={form.vcardFullName}
        error={errors.vcardFullName}
        autoComplete="name"
        onChange={(event) => onChange("vcardFullName", event.target.value)}
      />
      <Input
        id="qr-vcard-organization"
        label="Organization (optional)"
        value={form.vcardOrganization}
        autoComplete="organization"
        onChange={(event) => onChange("vcardOrganization", event.target.value)}
      />
      <Input
        id="qr-vcard-title"
        label="Job title (optional)"
        value={form.vcardTitle}
        autoComplete="organization-title"
        onChange={(event) => onChange("vcardTitle", event.target.value)}
      />
      <Input
        id="qr-vcard-phone"
        label="Phone (optional)"
        type="tel"
        inputMode="tel"
        value={form.vcardPhone}
        error={errors.vcardPhone}
        autoComplete="tel"
        onChange={(event) => onChange("vcardPhone", event.target.value)}
      />
      <Input
        id="qr-vcard-email"
        label="Email (optional)"
        type="email"
        inputMode="email"
        value={form.vcardEmail}
        error={errors.vcardEmail}
        autoComplete="email"
        onChange={(event) => onChange("vcardEmail", event.target.value)}
      />
      <Input
        id="qr-vcard-website"
        label="Website (optional)"
        type="url"
        inputMode="url"
        value={form.vcardWebsite}
        error={errors.vcardWebsite}
        placeholder="example.com"
        onChange={(event) => onChange("vcardWebsite", event.target.value)}
      />
      <TextareaField
        id="qr-vcard-address"
        label="Address (optional)"
        rows={3}
        value={form.vcardAddress}
        className="qr-vcard-address"
        autoComplete="street-address"
        onChange={(event) => onChange("vcardAddress", event.target.value)}
      />
    </div>
  );
}
