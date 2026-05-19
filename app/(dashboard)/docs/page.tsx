'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// SwaggerUI no es compatible con SSR de Next.js
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocs() {
  return (
    <div className="bg-white min-h-screen">
      <div className="bg-emerald-700 text-white p-6 shadow-lg">
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="mt-2 text-emerald-100">Documentación interactiva para desarrolladores de Campaña Espinal.</p>
      </div>
      <div className="p-4">
        <SwaggerUI url="/api/docs" />
      </div>
    </div>
  );
}
