import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';

  // Redirect www.flashlightratings.com to flashlightratings.com
  if (hostname === 'www.flashlightratings.com') {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.host = 'flashlightratings.com';
    
    return NextResponse.redirect(url, {
      status: 308, // Permanent Redirect (method-preserving)
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
