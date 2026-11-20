'use client';
import { Component, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

/** 섹션 단위 에러 바운더리 — 한 화면의 렌더 오류가 앱 전체를 죽이지 않게 격리.
 *  resetKey(라우트)가 바뀌면 자동 복구되고, 다시 시도/홈 이동으로 수동 복구도 가능. */
export class SectionBoundary extends Component<
  { resetKey: string; onHome: () => void; children: ReactNode },
  { error: Error | null; keyAtError: string | null }
> {
  state = { error: null as Error | null, keyAtError: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[section crash]', this.props.resetKey, error);
    this.setState({ keyAtError: this.props.resetKey });
  }

  render() {
    const { error, keyAtError } = this.state;
    if (error && keyAtError === this.props.resetKey) {
      return (
        <section className="card pad crash-box" role="alert">
          <CircleAlert size={28} aria-hidden="true" />
          <h2>이 화면에서 오류가 났어요</h2>
          <p className="meta">{error.message || '알 수 없는 오류'}</p>
          <div className="crash-actions">
            <button
              className="primary"
              onClick={() => this.setState({ error: null, keyAtError: null })}
            >
              다시 시도
            </button>
            <button className="link" onClick={this.props.onHome}>
              홈으로 이동
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
