"use client";

interface SubscriptionModalProps {
  onClose: () => void;
  /** Contextual message explaining why this feature requires subscription */
  message?: string;
  /** Optional callback for login instead of subscribe */
  onLogin?: () => void;
}

const PLUS_FEATURES = [
  { icon: "📄", text: "100페이지 이상 PDF 채팅" },
  { icon: "📁", text: "폴더 & 파일 정리" },
  { icon: "♾️", text: "무제한 질문" },
  { icon: "📝", text: "메모 & 요약 저장" },
  { icon: "⚡", text: "빠른 응답 속도" },
];

export default function SubscriptionModal({
  onClose,
  message,
  onLogin,
}: SubscriptionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">✨</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">LinguaRAG Plus</h3>
          <p className="text-sm text-gray-500 mt-1">
            {message ?? "이 기능은 Plus 구독이 필요해요"}
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-2.5 mb-6">
          {PLUS_FEATURES.map((f) => (
            <div key={f.text} className="flex items-center gap-2.5">
              <span className="text-base">{f.icon}</span>
              <span className="text-sm text-gray-700">{f.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => {
            // TODO: integrate payment (Stripe/Paddle)
            alert("결제 시스템 준비 중입니다. 곧 만나요!");
          }}
          className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition-colors text-sm font-semibold text-white"
        >
          Plus 시작하기
        </button>

        {/* Login alternative */}
        {onLogin && (
          <button
            onClick={onLogin}
            className="w-full mt-2 py-2.5 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-sm text-gray-600"
          >
            이미 계정이 있나요? 로그인
          </button>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">
          무료 체험 후 언제든 취소 가능
        </p>
      </div>
    </div>
  );
}
