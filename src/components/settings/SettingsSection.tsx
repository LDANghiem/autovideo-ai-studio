// ============================================================
// FILE: src/components/settings/SettingsSection.tsx
// ============================================================
// Ripple — Settings Section wrapper
// Dark theme, subtle borders, Space Grotesk heading.
// Used to group related settings fields under a labeled card.
// ============================================================

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <div
      className="rounded-xl p-5 mb-6"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {title && (
        <h3
          className="text-base font-semibold"
          style={{
            color: "#F5F2ED",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
      )}

      {description && (
        <p className="text-sm mt-1 mb-4" style={{ color: "#8B8794" }}>
          {description}
        </p>
      )}

      <div className="space-y-4">{children}</div>
    </div>
  );
}