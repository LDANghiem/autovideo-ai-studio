"use client";

import { useState } from "react";

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const videos = [
    {
      id: 1,
      title: "The Rise of Space Travel",
      category: "Science",
      thumbnail:
        "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&q=80",
    },
    {
      id: 2,
      title: "The Origins of AI",
      category: "AI",
      thumbnail:
        "https://images.unsplash.com/photo-1518779578993-ec3579fee39f?w=600&q=80",
    },
    {
      id: 3,
      title: "Ancient Civilizations",
      category: "History",
      thumbnail:
        "https://images.unsplash.com/photo-1531938713759-d49b64809c31?w=600&q=80",
    },
  ];

  const categories = ["All", "AI", "Science", "History"];

  const filteredVideos = videos.filter((v) => {
    const matchesSearch = v.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || v.category === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Video Library</h1>

      {/* Search Bar */}
      <input
        type="text"
        placeholder="Search videos..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border p-3 rounded w-full mb-6 shadow-sm"
      />

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-2 rounded-full text-sm ${
              filter === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredVideos.map((video) => (
          <div
            key={video.id}
            className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden"
          >
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-40 object-cover"
            />
            <div className="p-5">
              <h3 className="font-semibold text-lg">{video.title}</h3>
              <p className="text-gray-500 text-sm">{video.category}</p>

              <button className="mt-4 w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition">
                View Video
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredVideos.length === 0 && (
        <p className="text-gray-500 text-center mt-10 text-lg">
          No videos found.
        </p>
      )}
    </div>
  );
}
