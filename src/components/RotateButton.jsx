
export default function RotateButton({ onClick }) {
  return (
    <button
      className="px-6 py-2 bg-gray-600 rounded text-white shadow hover:bg-gray-700"
      onClick={onClick}
      aria-label="Rotate Camera"
    >
      Rotate
    </button>
  );
}
