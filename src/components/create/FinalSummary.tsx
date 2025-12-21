"use client";

import React from "react";

interface FinalSummaryProps {
  topic: string;
  style: string;
  voice: string;
  length: string;
  resolution: string;
  language: string;
  tone: string;
  music: string;
  onGenerate: () => void;
}

export default function FinalSummary({
  topic,
  style,
  voice,
  length,
  resolution,
  language,
  tone,
  music,
  onGenerate
}: FinalSummaryProps) {
  return (
    <div className="w-full bg-white rounded-xl shadow-md p-6 border border-gray-200 space-y-5">

      <h2 className="text-2xl font-semibold mb-4">Final Project Summary</h2>

      <div className="space-y-3 text-gray-700">
        <p><strong>Topic:</strong> {topic}</p>
        <p><strong>Style:</strong> {style}</p>
        <p><strong>Voice:</strong> {voice}</p>
        <p><strong>Video Length:</strong> {length}</p>
        <p><strong>Resolution:</strong> {resolution}</p>
        <p><strong>Language:</strong> {language}</p>
        <p><strong>Tone:</strong> {tone}</p>
        <p><strong>Music:</strong> {music}</p>
      </div>

      <button
        onClick={onGenerate}
        className="w-full bg-black text-white text-lg py-3 rounded-lg hover:bg-gray-800 transition"
      >
        Generate Video
      </button>
    </div>
  );
}
