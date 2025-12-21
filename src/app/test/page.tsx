export default function TestPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center">
      <h1 className="text-4xl font-bold text-indigo-600 mb-6">
        Tailwind is Working 🎉
      </h1>
      <div className="flex gap-4">
        <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
          Primary
        </button>
        <button className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
          Success
        </button>
        <button className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
          Danger
        </button>
      </div>
      <p className="mt-6 text-gray-500">Tailwind CSS + Next.js setup is complete ✅</p>
    </div>
  );
}
