import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <p>404</p>
        <h1>문서를 찾을 수 없습니다</h1>
        <span>링크가 바뀌었거나 아직 사이트에 포함되지 않은 문서일 수 있습니다.</span>
        <Link href="/">문서 홈으로 돌아가기</Link>
      </div>
    </main>
  )
}
