import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import koKR from 'antd/locale/ko_KR';
import hiIN from 'antd/locale/hi_IN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/ko';
import 'dayjs/locale/hi';
import { useLanguage } from './i18n/LanguageSelector';
import { getLocale } from './i18n/runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 },
    mutations: { retry: 0 },
  },
});

function LocalizedRoot() {
  const language = useLanguage();
  const locales = { vi: viVN, en: enUS, zh: zhCN, ko: koKR, hi: hiIN };
  dayjs.locale(language === 'zh' ? 'zh-cn' : language);
  document.documentElement.lang = getLocale();
  document.title = { vi: 'Roomie — Quản lý phòng trọ', en: 'Roomie — Rental management', zh: 'Roomie — 出租房管理', ko: 'Roomie — 임대 관리', hi: 'Roomie — किराया प्रबंधन' }[language];
  return (
    <ConfigProvider
      locale={locales[language]}
      theme={{
        token: {
          colorPrimary: '#0f9d83',
          colorInfo: '#0f9d83',
          colorSuccess: '#218b69',
          colorWarning: '#d18a32',
          colorError: '#d35b54',
          colorBgLayout: '#f4f7f6',
          colorBgContainer: '#ffffff',
          colorText: '#1d3037',
          colorTextSecondary: '#718188',
          borderRadius: 12,
          fontFamily: 'DM Sans, sans-serif',
          controlHeight: 42,
        },
        components: {
          Button: { fontWeight: 600, borderRadius: 10 },
          Card: { borderRadiusLG: 16 },
          Input: { borderRadius: 10 },
          Select: { borderRadius: 10 },
          Modal: { borderRadiusLG: 18 },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AntApp><AuthProvider><App /></AuthProvider></AntApp>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><LocalizedRoot /></React.StrictMode>);
