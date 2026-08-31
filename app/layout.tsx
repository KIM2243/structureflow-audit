import type {Metadata} from 'next';import './globals.css';import './extra.css';
export const metadata:Metadata={title:'StructureFlow — 트레이딩 의사결정 시스템',description:'미국·한국 주식의 멀티타임프레임 구조, Volume Profile, Wyckoff, 거래량과 백테스트를 한 화면에서 분석합니다.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg',apple:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
