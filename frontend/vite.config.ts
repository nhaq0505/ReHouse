import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          // Classify the innermost package, including dependencies nested under antd.
          id = id.slice(id.lastIndexOf('/node_modules/'));
          if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react-vendor';
          if (id.includes('/@ant-design/icons') || id.includes('/@ant-design/icons-svg/')) return 'antd-icons';
          if (id.includes('/@tanstack/')) return 'react-query';
          // Shared utilities, form contexts and locale data stay below component chunks
          // to avoid circular initialization between Ant Design's entry points.
          if (id.includes('/rc-util/')) return 'antd-core';
          if (/\/node_modules\/(rc-[^/]+|@rc-component)\//.test(id)) return 'antd-controls';
          if (/\/antd\/es\/form\/(context|validateMessagesContext|util|hooks\/)/.test(id)) return 'antd';
          if (id.includes('/antd/es/form/')) return 'antd-form';
          if (/\/antd\/es\/(date-picker|time-picker|calendar)\/locale\//.test(id)) return 'antd';
          if (/\/antd\/es\/(table|date-picker|time-picker|calendar|descriptions)\//.test(id)) return 'antd-data';
          if (id.includes('/antd/')) return 'antd';
          if (id.includes('/@ant-design/')) return 'antd-core';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5080',
        changeOrigin: false,
      },
    },
  },
});
