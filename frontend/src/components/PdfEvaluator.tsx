'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiService, PdfEvaluation } from '@/services/api';

// ============================================================
// ค่าคงที่สำหรับ PDF Evaluator
// ============================================================

/** ขนาดไฟล์สูงสุดที่รองรับ (10MB) */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '10MB';

/** ป้ายกำกับ Bloom's Taxonomy 6 ระดับ */
const BLOOM_LABELS: Record<string, string> = {
  remember: 'Remember (จำ)',
  understand: 'Understand (เข้าใจ)',
  apply: 'Apply (ประยุกต์)',
  analyze: 'Analyze (วิเคราะห์)',
  evaluate: 'Evaluate (ประเมิน)',
  create: 'Create (สร้างสรรค์)',
};

/** สีสำหรับ verdict ต่างๆ */
const VERDICT_COLORS: Record<string, string> = {
  'ดี': '#22c55e',
  'พอใช้': '#f59e0b',
  'ต้องปรับปรุง': '#ef4444',
};

/** ข้อความ loading ที่เปลี่ยนเป็นระยะ */
const LOADING_MESSAGES = [
  'กำลังสกัดข้อความจากไฟล์ PDF...',
  'กำลังวิเคราะห์โครงสร้างเนื้อหา...',
  'กำลังประเมิน Bloom\'s Taxonomy 6 ด้าน...',
  'กำลังคำนวณจำนวนข้อสอบที่สร้างได้...',
  'กำลังจัดทำรายงานผลการประเมิน...',
];

// ============================================================
// Bloom's Taxonomy Radar Chart (SVG)
// ============================================================

/** คุณสมบัติของ Radar Chart */
interface RadarChartProps {
  bloom_data: Record<string, { score: number; verdict: string }>;
}

/** วาดกราฟ Radar 6 เหลี่ยมแสดงคะแนน Bloom's Taxonomy ด้วย SVG */
function BloomRadarChart({ bloom_data }: RadarChartProps) {
  const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
  const CENTER_X = 150;
  const CENTER_Y = 150;
  const MAX_RADIUS = 110;

  // คำนวณจุดบน Radar ตามมุม (6 เหลี่ยม)
  const GetPoint = useCallback((index: number, value: number): { x: number; y: number } => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
    const radius = (value / 100) * MAX_RADIUS;
    return {
      x: CENTER_X + radius * Math.cos(angle),
      y: CENTER_Y + radius * Math.sin(angle),
    };
  }, []);

  // สร้าง polygon path จากค่าคะแนน
  const data_points = BLOOM_KEYS.map((key, i) => {
    const score = bloom_data[key]?.score ?? 0;
    return GetPoint(i, score);
  });
  const data_path = data_points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

  // สร้างเส้นตารางวงแหวน (20%, 40%, 60%, 80%, 100%)
  const grid_levels = [20, 40, 60, 80, 100];

  return (
    <svg viewBox="0 0 300 300" className="pdf-eval-radar-svg" aria-label="Bloom's Taxonomy Radar Chart">
      {/* เส้นตาราง (Grid Lines) */}
      {grid_levels.map((level) => {
        const grid_points = BLOOM_KEYS.map((_, i) => GetPoint(i, level));
        const grid_path = grid_points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
        return (
          <path
            key={`grid-${level}`}
            d={grid_path}
            fill="none"
            stroke="var(--color-gray-200)"
            strokeWidth="1"
            opacity={level === 100 ? 0.6 : 0.3}
          />
        );
      })}

      {/* เส้นแกนจากศูนย์กลาง */}
      {BLOOM_KEYS.map((_, i) => {
        const edge_point = GetPoint(i, 100);
        return (
          <line
            key={`axis-${i}`}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={edge_point.x}
            y2={edge_point.y}
            stroke="var(--color-gray-200)"
            strokeWidth="1"
            opacity="0.4"
          />
        );
      })}

      {/* พื้นที่คะแนน (Data Area) */}
      <path
        d={data_path}
        fill="rgba(177, 178, 255, 0.25)"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        className="pdf-eval-radar-area"
      />

      {/* จุดข้อมูล (Data Points) */}
      {data_points.map((p, i) => (
        <circle
          key={`dot-${i}`}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="var(--color-primary)"
          stroke="white"
          strokeWidth="2"
        />
      ))}

      {/* ป้ายกำกับ (Labels) */}
      {BLOOM_KEYS.map((key, i) => {
        const label_point = GetPoint(i, 130);
        const short_label = key.charAt(0).toUpperCase() + key.slice(1);
        const score = bloom_data[key]?.score ?? 0;
        return (
          <text
            key={`label-${i}`}
            x={label_point.x}
            y={label_point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="pdf-eval-radar-label"
          >
            <tspan x={label_point.x} dy="0" fontWeight="600" fontSize="11">{short_label}</tspan>
            <tspan x={label_point.x} dy="14" fontSize="10" fill="var(--color-gray-500)">{score}%</tspan>
          </text>
        );
      })}
    </svg>
  );
}


// ============================================================
// PdfEvaluator Component หลัก
// ============================================================

/** Props ของ PdfEvaluator */
interface PdfEvaluatorProps {
  user_id?: string;
}

/** สถานะของ Component */
type EvaluatorStep = 'upload' | 'loading' | 'result' | 'error';

/**
 * PdfEvaluator — Component สำหรับอัปโหลดไฟล์ PDF วิเคราะห์คุณภาพเนื้อหา
 * และแสดงผลลัพธ์เป็นรูปแบบ Premium Dashboard
 */
export default function PdfEvaluator({ user_id }: PdfEvaluatorProps) {
  // --- State Management ---
  const [current_step, SetCurrentStep] = useState<EvaluatorStep>('upload');
  const [selected_file, SetSelectedFile] = useState<File | null>(null);
  const [is_dragging, SetIsDragging] = useState(false);
  const [loading_message_index, SetLoadingMessageIndex] = useState(0);
  const [evaluation_result, SetEvaluationResult] = useState<PdfEvaluation | null>(null);
  const [error_message, SetErrorMessage] = useState('');
  const file_input_ref = useRef<HTMLInputElement>(null);

  // --- Loading Message Rotation ---
  // เปลี่ยนข้อความ loading ทุก 3 วินาทีเพื่อให้ผู้ใช้ไม่เบื่อรอ
  useEffect(() => {
    if (current_step !== 'loading') return;

    const interval = setInterval(() => {
      SetLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [current_step]);

  // --- File Validation ---
  /** ตรวจสอบไฟล์ว่าเป็น PDF และไม่เกินขนาดที่กำหนด */
  const ValidateFile = useCallback((file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return 'กรุณาเลือกไฟล์ PDF เท่านั้น (.pdf)';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `ขนาดไฟล์ต้องไม่เกิน ${MAX_FILE_SIZE_LABEL}`;
    }
    if (file.size === 0) {
      return 'ไฟล์ว่างเปล่า กรุณาเลือกไฟล์ที่มีเนื้อหา';
    }
    return null;
  }, []);

  // --- Drag & Drop Handlers ---
  const HandleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    SetIsDragging(true);
  }, []);

  const HandleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    SetIsDragging(false);
  }, []);

  const HandleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    SetIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const error = ValidateFile(file);
      if (error) {
        SetErrorMessage(error);
        SetCurrentStep('error');
        return;
      }
      SetSelectedFile(file);
    }
  }, [ValidateFile]);

  // --- File Input Handler ---
  const HandleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const error = ValidateFile(file);
      if (error) {
        SetErrorMessage(error);
        SetCurrentStep('error');
        return;
      }
      SetSelectedFile(file);
    }
  }, [ValidateFile]);

  // --- Main Evaluate Action ---
  /** ขั้นตอนหลัก: สกัดข้อความ → ส่งวิเคราะห์ → แสดงผล */
  const HandleEvaluate = useCallback(async () => {
    if (!selected_file) return;

    try {
      SetCurrentStep('loading');
      SetLoadingMessageIndex(0);

      // ขั้นตอนที่ 1: สกัดข้อความจาก PDF ผ่าน /api/pdf/extract
      const extract_result = await apiService.extractPdfText(selected_file);

      if (!extract_result.text || extract_result.text.trim().length < 50) {
        throw new Error('ไม่พบข้อความเพียงพอในไฟล์ PDF กรุณาลองไฟล์อื่น');
      }

      // ขั้นตอนที่ 2: ส่งข้อความไปวิเคราะห์คุณภาพผ่าน /api/pdf/evaluate
      const eval_result = await apiService.EvaluatePdfQuality(
        extract_result.text,
        undefined,
        user_id
      );

      // ขั้นตอนที่ 3: แสดงผลลัพธ์
      SetEvaluationResult(eval_result.evaluation);
      SetCurrentStep('result');

    } catch (error: any) {
      console.error('PDF Evaluation Error:', error);
      SetErrorMessage(error?.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ PDF กรุณาลองใหม่');
      SetCurrentStep('error');
    }
  }, [selected_file, user_id]);

  // --- Reset Action ---
  /** รีเซ็ตกลับไปหน้า Upload */
  const HandleReset = useCallback(() => {
    SetCurrentStep('upload');
    SetSelectedFile(null);
    SetEvaluationResult(null);
    SetErrorMessage('');
    SetLoadingMessageIndex(0);
    if (file_input_ref.current) {
      file_input_ref.current.value = '';
    }
  }, []);

  // --- Helper: Format File Size ---
  const FormatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <section className="pdf-eval-container" id="pdf-evaluator" aria-label="ส่วนประเมินคุณภาพ PDF">
      {/* ===== Header ===== */}
      <div className="pdf-eval-header">
        <div className="pdf-eval-header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div>
          <h2 className="pdf-eval-title">ประเมินคุณภาพเนื้อหา PDF</h2>
          <p className="pdf-eval-subtitle">วิเคราะห์เนื้อหาด้วย AI ว่าเหมาะสำหรับสร้างบทเรียนและข้อสอบ 40 ข้อหรือไม่</p>
        </div>
      </div>

      {/* ===== Upload Step ===== */}
      {current_step === 'upload' && (
        <div className="pdf-eval-upload-area">
          {/* Dropzone */}
          <div
            className={`pdf-eval-dropzone ${is_dragging ? 'pdf-eval-dropzone--active' : ''}`}
            onDragOver={HandleDragOver}
            onDragLeave={HandleDragLeave}
            onDrop={HandleDrop}
            onClick={() => file_input_ref.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="คลิกหรือลากไฟล์ PDF มาวางที่นี่"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') file_input_ref.current?.click(); }}
          >
            <input
              ref={file_input_ref}
              type="file"
              accept=".pdf"
              onChange={HandleFileSelect}
              className="pdf-eval-file-input"
              tabIndex={-1}
              aria-hidden="true"
            />

            <div className="pdf-eval-dropzone-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            <p className="pdf-eval-dropzone-text">
              {is_dragging ? 'ปล่อยไฟล์เพื่ออัปโหลด' : 'ลากไฟล์ PDF มาวางที่นี่'}
            </p>
            <p className="pdf-eval-dropzone-hint">
              หรือคลิกเพื่อเลือกไฟล์ &bull; รองรับ .pdf สูงสุด {MAX_FILE_SIZE_LABEL}
            </p>
          </div>

          {/* ข้อมูลไฟล์ที่เลือกแล้ว */}
          {selected_file && (
            <div className="pdf-eval-file-info">
              <div className="pdf-eval-file-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="pdf-eval-file-name">{selected_file.name}</span>
                <span className="pdf-eval-file-size">{FormatFileSize(selected_file.size)}</span>
              </div>
              <button
                className="pdf-eval-remove-btn"
                onClick={(e) => { e.stopPropagation(); HandleReset(); }}
                aria-label="ลบไฟล์ที่เลือก"
              >
                ✕
              </button>
            </div>
          )}

          {/* ปุ่มวิเคราะห์ */}
          <button
            className="pdf-eval-analyze-btn"
            onClick={HandleEvaluate}
            disabled={!selected_file}
            aria-label="วิเคราะห์คุณภาพ PDF"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            วิเคราะห์คุณภาพ PDF
          </button>
        </div>
      )}

      {/* ===== Loading Step ===== */}
      {current_step === 'loading' && (
        <div className="pdf-eval-loading">
          {/* Animated Spinner */}
          <div className="pdf-eval-spinner">
            <div className="pdf-eval-spinner-ring" />
            <div className="pdf-eval-spinner-ring pdf-eval-spinner-ring--delay" />
          </div>

          {/* Loading Message */}
          <p className="pdf-eval-loading-text" key={loading_message_index}>
            {LOADING_MESSAGES[loading_message_index]}
          </p>

          {/* Progress Dots */}
          <div className="pdf-eval-loading-dots">
            {[0, 1, 2].map((i) => (
              <span key={i} className="pdf-eval-loading-dot" style={{ animationDelay: `${i * 0.3}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Error Step ===== */}
      {current_step === 'error' && (
        <div className="pdf-eval-error">
          <div className="pdf-eval-error-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="pdf-eval-error-text">{error_message}</p>
          <button className="pdf-eval-retry-btn" onClick={HandleReset}>
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}

      {/* ===== Result Step ===== */}
      {current_step === 'result' && evaluation_result && (
        <div className="pdf-eval-result">
          {/* --- Summary Card --- */}
          <div className={`pdf-eval-summary-card ${evaluation_result.overall.is_passed ? 'pdf-eval-summary--pass' : 'pdf-eval-summary--fail'}`}>
            <div className="pdf-eval-score-circle">
              <span className="pdf-eval-score-number">{evaluation_result.overall.quality_score}</span>
              <span className="pdf-eval-score-total">/100</span>
            </div>
            <div className="pdf-eval-summary-info">
              <span className={`pdf-eval-verdict-badge ${evaluation_result.overall.is_passed ? 'pdf-eval-badge--pass' : 'pdf-eval-badge--fail'}`}>
                {evaluation_result.overall.is_passed ? '✓ ผ่านเกณฑ์' : '✕ ไม่ผ่านเกณฑ์'}
              </span>
              <p className="pdf-eval-verdict-text">{evaluation_result.overall.verdict}</p>
            </div>
          </div>

          {/* --- Content Length + Exam Readiness --- */}
          <div className="pdf-eval-metrics-row">
            {/* Content Length Card */}
            <div className="pdf-eval-metric-card">
              <h3 className="pdf-eval-metric-title">📄 ความยาวเนื้อหา</h3>
              <div className="pdf-eval-metric-stats">
                <span>{evaluation_result.content_length.word_count.toLocaleString()} คำ</span>
                <span>~{evaluation_result.content_length.page_estimate} หน้า</span>
              </div>
              <span className={`pdf-eval-length-verdict pdf-eval-length--${evaluation_result.content_length.verdict === 'พอดี' ? 'ok' : 'warn'}`}>
                {evaluation_result.content_length.verdict}
              </span>
              <p className="pdf-eval-metric-detail">{evaluation_result.content_length.detail}</p>
            </div>

            {/* Exam Readiness Card */}
            <div className="pdf-eval-metric-card">
              <h3 className="pdf-eval-metric-title">📝 ข้อสอบที่สร้างได้</h3>
              <div className="pdf-eval-exam-bar-container">
                <div className="pdf-eval-exam-bar-bg">
                  <div
                    className="pdf-eval-exam-bar-fill"
                    style={{
                      width: `${Math.min(100, (evaluation_result.exam_readiness.estimated_questions / evaluation_result.exam_readiness.target_questions) * 100)}%`,
                    }}
                  />
                </div>
                <span className="pdf-eval-exam-bar-label">
                  {evaluation_result.exam_readiness.estimated_questions} / {evaluation_result.exam_readiness.target_questions} ข้อ
                </span>
              </div>
              <span className={`pdf-eval-exam-verdict ${evaluation_result.exam_readiness.is_sufficient ? 'pdf-eval-exam--pass' : 'pdf-eval-exam--fail'}`}>
                {evaluation_result.exam_readiness.is_sufficient ? '✓ เพียงพอ' : '✕ ไม่เพียงพอ'}
              </span>
              <p className="pdf-eval-metric-detail">{evaluation_result.exam_readiness.detail}</p>
            </div>
          </div>

          {/* --- Bloom's Taxonomy Radar Chart --- */}
          <div className="pdf-eval-bloom-section">
            <h3 className="pdf-eval-section-title">🎯 Bloom&apos;s Taxonomy Analysis</h3>
            <div className="pdf-eval-bloom-layout">
              {/* Radar Chart */}
              <div className="pdf-eval-radar-wrapper">
                <BloomRadarChart bloom_data={evaluation_result.bloom_taxonomy} />
              </div>

              {/* Bloom Level List */}
              <div className="pdf-eval-bloom-list">
                {Object.entries(BLOOM_LABELS).map(([key, label]) => {
                  const level = evaluation_result.bloom_taxonomy[key];
                  if (!level) return null;
                  return (
                    <div key={key} className="pdf-eval-bloom-item">
                      <div className="pdf-eval-bloom-item-header">
                        <span className="pdf-eval-bloom-name">{label}</span>
                        <span
                          className="pdf-eval-bloom-verdict"
                          style={{ color: VERDICT_COLORS[level.verdict] || 'var(--color-gray-500)' }}
                        >
                          {level.verdict}
                        </span>
                      </div>
                      <div className="pdf-eval-bloom-bar-bg">
                        <div
                          className="pdf-eval-bloom-bar-fill"
                          style={{ width: `${level.score}%` }}
                        />
                      </div>
                      {level.found_indicators.length > 0 && (
                        <p className="pdf-eval-bloom-indicators">
                          พบ: {level.found_indicators.join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* --- Recommendations --- */}
          {evaluation_result.overall.recommendations.length > 0 && (
            <div className="pdf-eval-recommendations">
              <h3 className="pdf-eval-section-title">💡 คำแนะนำ</h3>
              <ul className="pdf-eval-rec-list">
                {evaluation_result.overall.recommendations.map((rec, i) => (
                  <li key={i} className="pdf-eval-rec-item">{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* --- Action Buttons --- */}
          <div className="pdf-eval-actions">
            <button className="pdf-eval-reset-btn" onClick={HandleReset}>
              อัปโหลดไฟล์ใหม่
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
