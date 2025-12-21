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
    <div className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm mb-6">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>

      {description && (
        <p className="text-sm text-gray-500 mt-1 mb-4">{description}</p>
      )}

      <div className="space-y-4">{children}</div>
    </div>
  );
}
