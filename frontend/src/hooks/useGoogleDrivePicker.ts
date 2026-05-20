"use client";

import { useState, useEffect } from 'react';

// ประกาศ type ให้ TypeScript รู้จัก gapi และ google
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface UseGoogleDrivePickerProps {
  clientId: string;
  apiKey: string;
  onFileSelect: (file: any) => void;
}

export function useGoogleDrivePicker({ clientId, apiKey, onFileSelect }: UseGoogleDrivePickerProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);

  // 1. Load Google API Scripts
  useEffect(() => {
    let gapiLoaded = false;
    let gisLoaded = false;

    const checkReady = () => {
      if (gapiLoaded && gisLoaded) {
        setIsReady(true);
      }
    };

    // Load GAPI (Picker)
    if (!window.gapi) {
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.async = true;
      gapiScript.defer = true;
      gapiScript.onload = () => {
        window.gapi.load('picker', {
          callback: () => {
            gapiLoaded = true;
            checkReady();
          }
        });
      };
      document.body.appendChild(gapiScript);
    } else {
      window.gapi.load('picker', {
        callback: () => {
          gapiLoaded = true;
          checkReady();
        }
      });
    }

    // Load Google Identity Services (GIS)
    if (!window.google) {
      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      gisScript.async = true;
      gisScript.defer = true;
      gisScript.onload = () => {
        initTokenClient();
        gisLoaded = true;
        checkReady();
      };
      document.body.appendChild(gisScript);
    } else {
      initTokenClient();
      gisLoaded = true;
      checkReady();
    }

    function initTokenClient() {
      if (!clientId) return;
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            createPicker(tokenResponse.access_token);
          }
        },
      });
      setTokenClient(client);
    }

  }, [clientId, apiKey]);

  const createPicker = (accessToken: string) => {
    if (!window.gapi || !window.gapi.picker) return;

    const view = new window.gapi.picker.DocsView(window.gapi.picker.ViewId.DOCS);
    view.setIncludeFolders(true);

    const picker = new window.gapi.picker.PickerBuilder()
      .enableFeature(window.gapi.picker.Feature.NAV_HIDDEN)
      .enableFeature(window.gapi.picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(apiKey)
      .setAppId(clientId.split('-')[0])
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === window.gapi.picker.Action.PICKED) {
          // ดึงไฟล์ทั้งหมดที่เลือก
          const files = data.docs;
          if (files && files.length > 0) {
            onFileSelect(files[0]); // ปัจจุบันรองรับ 1 ไฟล์
          }
        }
      })
      .build();
    picker.setVisible(true);
  };

  const openPicker = () => {
    if (!clientId || !apiKey) {
      setError("Google Client ID or API Key is missing.");
      alert("กรุณาตั้งค่า Google Client ID และ API Key ในไฟล์ .env ก่อนใช้งานครับ");
      return;
    }
    if (!isReady || !tokenClient) {
      console.warn("Google API scripts are not fully loaded yet.");
      return;
    }

    // ขอ Token และเปิด Picker อัตโนมัติใน callback
    tokenClient.requestAccessToken({ prompt: '' });
  };

  return { openPicker, isReady, error };
}
