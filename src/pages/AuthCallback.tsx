// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { userManager } from '../lib/auth';

export function AuthCallback() {
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    userManager.signinRedirectCallback().then((user) => {
      const returnTo = (user.state as { returnTo?: string } | undefined)?.returnTo;
      window.location.replace(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể hoàn tất đăng nhập.'));
  }, []);
  return <main className="auth-callback"><div className="auth-mark">OC</div><h1>{error ? 'Đăng nhập chưa thành công' : 'Đang hoàn tất đăng nhập…'}</h1>{error && <><p>{error}</p><a href="/">Trở về trang chủ</a></>}</main>;
}
