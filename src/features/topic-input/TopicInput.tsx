'use client';

import { useState } from 'react';

export default function TopicInput() {
  const [topic, setTopic] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Topic submitted: ${topic}`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="topic" className="block text-sm font-medium text-gray-700">
        Enter a Topic
      </label>
      <input
        type="text"
        id="topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        placeholder="e.g. History of Space Travel"
      />
      <button
        type="submit"
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Submit
      </button>
    </form>
  );
}
