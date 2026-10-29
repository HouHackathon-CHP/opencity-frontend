// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, ShieldAlert } from 'lucide-react';
import { userManager } from '../lib/auth';
import { LogoIcon } from '../components/Logo';

export function AuthCallback() {
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    userManager
      .signinRedirectCallback()
      .then((user) => {
        const returnTo = (user.state as { returnTo?: string } | undefined)?.returnTo;
        window.location.replace(
          returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/',
        );
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Không thể hoàn tất quá trình xác thực OIDC.');
      });
  }, []);

  return (
    <main className="auth-callback-page">
      <div className="auth-callback-card">
        {error ? (
          <>
            <div className="callback-icon-badge error-badge">
              <ShieldAlert size={36} />
            </div>
            <h2>Đăng nhập chưa thành công</h2>
            <p className="callback-desc">{error}</p>
            <a href="/" className="btn-primary">
              <ArrowLeft size={16} />
              <span>Quay về trang chủ OpenCity</span>
            </a>
          </>
        ) : (
          <>
            <div className="callback-icon-badge loading-badge" style={{ background: 'transparent' }}>
              <LogoIcon size={58} />
            </div>
            <h2>Đang xác thực phiên làm việc…</h2>
            <p className="callback-desc">
              Hệ thống đang trao đổi mã bảo mật OIDC với máy chủ DX-OS Identity.
            </p>
            <div className="callback-spinner-wrap">
              <LoaderCircle size={24} className="spin" />
              <span>Vui lòng chờ trong giây lát</span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
