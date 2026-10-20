import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <Link href="/" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-grass px-4 text-white">
        홈으로
      </Link>
    </main>
  );
}
