
export default function RecognizeButton({ onClick }) {
  return (
    <button
      className="px-6 py-2 bg-blue-600 rounded text-white shadow hover:bg-blue-700"
      onClick={onClick}
    >
      Recognize
    </button>
  );
}
