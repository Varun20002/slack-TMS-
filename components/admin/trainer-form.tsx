"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createTrainerAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Static data ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam",
  "Bengali", "Marathi", "Gujarati", "Punjabi", "Urdu", "Odia",
  "Assamese", "Maithili", "Sanskrit", "Konkani", "Nepali", "Sindhi"
];

const CITIES = [
  "Ahmedabad", "Bangalore", "Bhopal", "Chennai", "Coimbatore", "Delhi",
  "Faridabad", "Ghaziabad", "Hyderabad", "Indore", "Jaipur", "Kanpur",
  "Kochi", "Kolkata", "Lucknow", "Ludhiana", "Meerut", "Mumbai",
  "Nagpur", "Nashik", "Patna", "Pimpri-Chinchwad", "Pune", "Rajkot",
  "Srinagar", "Surat", "Thane", "Vadodara", "Varanasi", "Visakhapatnam"
];

const defaultForm = {
  name: "",
  experience: "",
  investing_trading_persona: "",
  strengths: "",
  nature_of_business: "",
  email: "",
  credentials_or_claim_to_fame: ""
};

// ─── Main component ───────────────────────────────────────────────────────────

export function TrainerForm() {
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  // Simple fields
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Phone
  const [phoneDigits, setPhoneDigits] = useState("");

  // Languages multi-select
  const [langInput, setLangInput] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [langDropOpen, setLangDropOpen] = useState(false);

  // City single autocomplete
  const [cityInput, setCityInput] = useState("");
  const [cityDropOpen, setCityDropOpen] = useState(false);

  // Social handles
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [twitter, setTwitter] = useState("");
  const [facebook, setFacebook] = useState("");

  // File
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Refs for click-outside
  const langRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangDropOpen(false);
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Prevent background scroll when modal open
  useEffect(() => {
    document.body.style.overflow = modalOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modalOpen]);

  // ─── Language helpers ───────────────────────────────────────────────────────

  const filteredLangs = LANGUAGES.filter(
    (l) => l.toLowerCase().includes(langInput.toLowerCase()) && !selectedLanguages.includes(l)
  );

  function addLanguage(lang: string) {
    setSelectedLanguages((prev) => [...prev, lang]);
    setLangInput("");
  }

  function removeLanguage(lang: string) {
    setSelectedLanguages((prev) => prev.filter((l) => l !== lang));
  }

  // ─── City helpers ───────────────────────────────────────────────────────────

  const filteredCities = CITIES.filter((c) => c.toLowerCase().includes(cityInput.toLowerCase()));

  // ─── Validate ──────────────────────────────────────────────────────────────

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (!form.experience || Number(form.experience) < 0) e.experience = "Experience is required.";
    if (!form.investing_trading_persona.trim()) e.investing_trading_persona = "Persona is required.";
    if (!form.strengths.trim()) e.strengths = "Strengths is required.";
    if (!form.nature_of_business.trim()) e.nature_of_business = "Nature of business is required.";
    if (!phoneDigits.trim() || phoneDigits.replace(/\D/g, "").length < 8) e.phone_number = "Enter a valid 10-digit number.";
    if (!form.email.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) e.email = "Enter a valid email.";
    if (selectedLanguages.length === 0) e.languages_spoken = "Select at least one language.";
    if (!cityInput.trim()) e.base_city = "City is required.";
    if (!form.credentials_or_claim_to_fame.trim()) e.credentials_or_claim_to_fame = "Bio is required.";
    if (!instagram.trim() && !youtube.trim() && !twitter.trim() && !facebook.trim())
      e.social = "Enter at least one social media handle.";
    if (!fileRef.current?.files?.[0]) e.profile_image = "Profile photo is required.";
    return e;
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    startTransition(async () => {
      setTemporaryPassword("");

      const socialObj: Record<string, string> = {};
      if (instagram.trim()) socialObj.instagram = instagram.trim();
      if (youtube.trim()) socialObj.youtube = youtube.trim();
      if (twitter.trim()) socialObj.twitter = twitter.trim();
      if (facebook.trim()) socialObj.facebook = facebook.trim();

      const formData = new FormData();
      formData.append("name", form.name.trim());
      formData.append("experience", form.experience);
      formData.append("investing_trading_persona", form.investing_trading_persona.trim());
      formData.append("strengths", form.strengths.trim());
      formData.append("nature_of_business", form.nature_of_business.trim());
      formData.append("phone_number", `+91${phoneDigits.trim()}`);
      formData.append("email", form.email.trim());
      formData.append("languages_spoken", selectedLanguages.join(", "));
      formData.append("base_city", cityInput.trim());
      formData.append("credentials_or_claim_to_fame", form.credentials_or_claim_to_fame.trim());
      formData.append("social_media_handles", JSON.stringify(socialObj));
      formData.append("product_categories", "");
      formData.append("certifications", "");

      const file = fileRef.current?.files?.[0];
      if (file) formData.append("profile_image", file);

      const res = await createTrainerAction(formData);
      if (!res.success) {
        toast.error("Trainer not created", { description: res.message });
        return;
      }

      toast.success("Trainer created successfully");
      if (res.temporaryPassword) setTemporaryPassword(res.temporaryPassword);

      // reset
      setForm(defaultForm);
      setPhoneDigits("");
      setSelectedLanguages([]);
      setLangInput("");
      setCityInput("");
      setInstagram(""); setYoutube(""); setTwitter(""); setFacebook("");
      setErrors({});
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function closeModal() {
    setModalOpen(false);
    setTemporaryPassword("");
    setErrors({});
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Button onClick={() => setModalOpen(true)}>Onboard Now</Button>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-10 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-xl border bg-card shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold">Onboard New Trainer</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Fill all details to create a trainer account.</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {temporaryPassword ? (
              /* ── Success state: only show temp password + close ── */
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Trainer created successfully</p>
                    <p className="text-sm text-muted-foreground">Share the temporary password with the trainer.</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                  <p className="text-sm font-medium">Temporary Password</p>
                  <div className="flex gap-2">
                    <Input value={temporaryPassword} readOnly className="font-mono text-sm" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(temporaryPassword); toast.success("Copied to clipboard"); }
                        catch { toast.error("Copy failed — please copy manually."); }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The trainer will be required to set a new password on first sign-in.
                  </p>
                </div>

                <div className="flex justify-end border-t pt-4">
                  <Button type="button" onClick={closeModal}>Close</Button>
                </div>
              </div>
            ) : (
              /* ── Form state ── */
              <form onSubmit={handleSubmit} noValidate>
                <div className="grid gap-4 p-6 md:grid-cols-2">

                  <Field label="Name" error={errors.name} required>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                  </Field>

                  <Field label="Experience (years)" error={errors.experience} required>
                    <Input type="number" min={0} max={50} value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} placeholder="e.g. 6" />
                  </Field>

                  <Field label="Persona" error={errors.investing_trading_persona} required>
                    <Input value={form.investing_trading_persona} onChange={(e) => setForm((f) => ({ ...f, investing_trading_persona: e.target.value }))} placeholder="e.g. Swing Trader" />
                  </Field>

                  <Field label="Strengths" error={errors.strengths} required>
                    <Input value={form.strengths} onChange={(e) => setForm((f) => ({ ...f, strengths: e.target.value }))} placeholder="e.g. Options strategy" />
                  </Field>

                  <Field label="Nature of Business" error={errors.nature_of_business} required>
                    <Input value={form.nature_of_business} onChange={(e) => setForm((f) => ({ ...f, nature_of_business: e.target.value }))} placeholder="e.g. Full-time trader" />
                  </Field>

                  {/* Phone with +91 prefix */}
                  <Field label="Phone" error={errors.phone_number} required>
                    <div className="flex">
                      <span className="flex h-10 items-center rounded-l-lg border border-r-0 bg-muted px-3 text-sm font-medium text-muted-foreground select-none">
                        +91
                      </span>
                      <Input
                        className="rounded-l-none"
                        type="tel"
                        maxLength={10}
                        value={phoneDigits}
                        onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, ""))}
                        placeholder="10-digit number"
                      />
                    </div>
                  </Field>

                  <Field label="Email" error={errors.email} required>
                    <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="trainer@example.com" />
                  </Field>

                  {/* Languages autocomplete multi-select */}
                  <Field label="Languages Spoken" error={errors.languages_spoken} required>
                    <div ref={langRef} className="relative">
                      {selectedLanguages.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          {selectedLanguages.map((lang) => (
                            <span key={lang} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              {lang}
                              <button type="button" onClick={() => removeLanguage(lang)} className="hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <Input
                        value={langInput}
                        onChange={(e) => { setLangInput(e.target.value); setLangDropOpen(true); }}
                        onFocus={() => setLangDropOpen(true)}
                        placeholder="Type to search languages…"
                      />
                      {langDropOpen && filteredLangs.length > 0 && (
                        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
                          {filteredLangs.map((lang) => (
                            <li key={lang}>
                              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                                onMouseDown={(e) => { e.preventDefault(); addLanguage(lang); setLangDropOpen(false); }}>
                                <Check className="h-3.5 w-3.5 opacity-0" />
                                {lang}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Field>

                  {/* City autocomplete */}
                  <Field label="City" error={errors.base_city} required>
                    <div ref={cityRef} className="relative">
                      <Input
                        value={cityInput}
                        onChange={(e) => { setCityInput(e.target.value); setCityDropOpen(true); }}
                        onFocus={() => setCityDropOpen(true)}
                        placeholder="Type to search cities…"
                      />
                      {cityDropOpen && cityInput && filteredCities.length > 0 && (
                        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
                          {filteredCities.map((city) => (
                            <li key={city}>
                              <button type="button"
                                className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted", city === cityInput && "bg-primary/5 font-medium")}
                                onMouseDown={(e) => { e.preventDefault(); setCityInput(city); setCityDropOpen(false); }}>
                                {city === cityInput ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5" />}
                                {city}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Field>

                  {/* Bio full-width */}
                  <Field label="Bio" error={errors.credentials_or_claim_to_fame} required className="md:col-span-2">
                    <Textarea
                      rows={3}
                      value={form.credentials_or_claim_to_fame}
                      onChange={(e) => setForm((f) => ({ ...f, credentials_or_claim_to_fame: e.target.value }))}
                      placeholder="Brief background and trading credentials…"
                    />
                  </Field>

                  {/* Social media — 4 platform fields */}
                  <div className="md:col-span-2">
                    <Label className="mb-2 block">
                      Social Media Handles <span className="text-destructive">*</span>
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(at least one)</span>
                    </Label>
                    {errors.social && <p className="mb-2 text-xs text-destructive">{errors.social}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SocialField platform="Instagram" value={instagram} onChange={setInstagram} placeholder="@username" />
                      <SocialField platform="YouTube" value={youtube} onChange={setYoutube} placeholder="@channel or URL" />
                      <SocialField platform="Twitter / X" value={twitter} onChange={setTwitter} placeholder="@username" />
                      <SocialField platform="Facebook" value={facebook} onChange={setFacebook} placeholder="Profile name or URL" />
                    </div>
                  </div>

                  {/* Profile photo */}
                  <Field label="Profile Photo" error={errors.profile_image} required>
                    <Input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" />
                  </Field>

                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 border-t px-6 py-4">
                  <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create Trainer"}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label, error, required, className, children
}: {
  label: string; error?: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SocialField({ platform, value, onChange, placeholder }: {
  platform: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{platform}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-sm" />
    </div>
  );
}
