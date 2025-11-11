"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "paused";

type CaptureSource = "camera" | "screen";

const COUNTDOWN_SECONDS = 3;

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStudioReady, setIsStudioReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [overlayText, setOverlayText] = useState("Здравствуйте! Готов записать ваше видео.");
  const [projectTitle, setProjectTitle] = useState("Мой проект");
  const [captureSource, setCaptureSource] = useState<CaptureSource>("camera");
  const [includeMicrophone, setIncludeMicrophone] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedSeconds(0);
  }, []);

  const teardownStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      teardownStream();
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      resetTimer();
    };
  }, [recordedUrl, resetTimer, teardownStream]);

  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => {
        setError("Не удалось автоматически воспроизвести предварительный просмотр.");
      });
    }
  }, []);

  const prepareStudio = useCallback(
    async (source: CaptureSource, mic: boolean) => {
      try {
        setError(null);
        setIsStudioReady(false);
        teardownStream();

        let stream: MediaStream;

        if (source === "camera") {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: 1280,
              height: 720
            },
            audio: mic
          });
        } else {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });

          if (mic) {
            try {
              const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              micStream.getAudioTracks().forEach((track) => screenStream.addTrack(track));
            } catch (micErr) {
              console.warn("Microphone capture failed", micErr);
            }
          }

          stream = screenStream;
        }

        streamRef.current = stream;
        attachStreamToVideo(stream);
        setIsStudioReady(true);
      } catch (err) {
        const fallback =
          source === "camera"
            ? "Не удалось получить доступ к камере."
            : "Не удалось получить доступ к экрану.";
        const message = err instanceof Error && err.message ? err.message : fallback;
        setError(message);
        teardownStream();
      }
    },
    [attachStreamToVideo, teardownStream]
  );

  const handleEnableStudio = useCallback(() => {
    void prepareStudio(captureSource, includeMicrophone);
  }, [captureSource, includeMicrophone, prepareStudio]);

  const handleSelectSource = useCallback(
    (source: CaptureSource) => {
      setCaptureSource(source);
      if (isStudioReady) {
        void prepareStudio(source, includeMicrophone);
      }
    },
    [includeMicrophone, isStudioReady, prepareStudio]
  );

  const handleToggleMicrophone = useCallback(
    (nextValue: boolean) => {
      setIncludeMicrophone(nextValue);
      if (isStudioReady) {
        void prepareStudio(captureSource, nextValue);
      }
    },
    [captureSource, isStudioReady, prepareStudio]
  );

  const createRecorder = (stream: MediaStream) => {
    const supportedTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];

    const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));

    if (!mimeType) {
      throw new Error("Ваш браузер не поддерживает запись видео WebM.");
    }

    return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  };

  const startTimer = useCallback(() => {
    resetTimer();
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, [resetTimer]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setError("Нет активного источника для записи. Включите студию.");
      return;
    }

    try {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(null);
      }

      const recorder = createRecorder(streamRef.current);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecorderState("idle");
        resetTimer();
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecorderState("recording");
      startTimer();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось начать запись.";
      setError(message);
    }
  }, [recordedUrl, resetTimer, startTimer]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderState !== "idle") {
      recorderRef.current.stop();
      recorderRef.current = null;
      teardownStream();
      setIsStudioReady(false);
      setCountdown(null);
    }
  }, [recorderState, teardownStream]);

  const pauseRecording = () => {
    if (recorderRef.current && recorderState === "recording") {
      recorderRef.current.pause();
      setRecorderState("paused");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resumeRecording = () => {
    if (recorderRef.current && recorderState === "paused") {
      recorderRef.current.resume();
      setRecorderState("recording");
      startTimer();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const beginCountdown = () => {
    if (countdown !== null || recorderState !== "idle") {
      return;
    }

    let remaining = COUNTDOWN_SECONDS;
    setCountdown(remaining);
    const countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        setCountdown(null);
        startRecording();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  };

  const downloadRecording = () => {
    if (!recordedUrl) {
      return;
    }
    const fileName = `${projectTitle.replace(/[^a-zA-Z0-9\-_]+/g, "_") || "video"}.webm`;
    const anchor = document.createElement("a");
    anchor.href = recordedUrl;
    anchor.download = fileName;
    anchor.click();
  };

  return (
    <main className="page">
      <section className="stage">
        <div className="stage-header">
          <h1>{projectTitle}</h1>
          <p className="stage-meta">
            {recorderState === "recording" && <span className="badge badge-live">REC</span>}
            <span className="badge">{formatDuration(elapsedSeconds)}</span>
            <span className="badge">Источник: {captureSource === "camera" ? "камера" : "экран"}</span>
          </p>
        </div>
        <div className="video-wrapper">
          <video ref={videoRef} className="video-preview" muted playsInline />
          {showOverlay && overlayText && <div className="overlay-text">{overlayText}</div>}
          {countdown !== null && <div className="countdown">{countdown}</div>}
          {!isStudioReady && recorderState === "idle" && (
            <div className="placeholder">
              <p>Включите студию, чтобы подготовиться к записи.</p>
            </div>
          )}
        </div>
      </section>
      <section className="controls">
        <div className="panel">
          <h2>1. Настроить студию</h2>
          <label className="field">
            <span>Название проекта</span>
            <input
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              placeholder="Например, Вступительное видео"
            />
          </label>
          <label className="field">
            <span>Источник захвата</span>
            <div className="segmented">
              <button
                className={captureSource === "camera" ? "active" : ""}
                onClick={() => handleSelectSource("camera")}
                type="button"
              >
                Камера
              </button>
              <button
                className={captureSource === "screen" ? "active" : ""}
                onClick={() => handleSelectSource("screen")}
                type="button"
              >
                Экран
              </button>
            </div>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeMicrophone}
              onChange={(event) => handleToggleMicrophone(event.target.checked)}
            />
            Записывать микрофон
          </label>
          <button className="primary" type="button" onClick={handleEnableStudio}>
            {isStudioReady ? "Перезапустить источник" : "Включить студию"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>

        <div className="panel">
          <h2>2. Контент</h2>
          <label className="field">
            <span>Текст на экране</span>
            <textarea
              rows={4}
              value={overlayText}
              onChange={(event) => setOverlayText(event.target.value)}
              placeholder="Напишите подсказки или сценарий для записи"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(event) => setShowOverlay(event.target.checked)}
            />
            Показать телесуфлер поверх видео
          </label>
        </div>

        <div className="panel">
          <h2>3. Запись</h2>
          <div className="actions">
            <button
              className="primary"
              type="button"
              onClick={beginCountdown}
              disabled={!isStudioReady || recorderState !== "idle"}
            >
              Записать
            </button>
            <button
              type="button"
              onClick={recorderState === "paused" ? resumeRecording : pauseRecording}
              disabled={recorderState === "idle"}
            >
              {recorderState === "paused" ? "Продолжить" : "Пауза"}
            </button>
            <button type="button" onClick={stopRecording} disabled={recorderState === "idle"}>
              Стоп
            </button>
          </div>
          <p className="hint">После нажатия «Записать» начнётся обратный отсчёт {COUNTDOWN_SECONDS} секунды.</p>
        </div>

        <div className="panel">
          <h2>4. Экспорт</h2>
          <button
            className="secondary"
            type="button"
            onClick={downloadRecording}
            disabled={!recordedUrl}
          >
            Скачать видео
          </button>
          {recordedUrl && (
            <video controls className="video-result">
              <source src={recordedUrl} type="video/webm" />
              Ваш браузер не поддерживает встроенное воспроизведение видео.
            </video>
          )}
        </div>
      </section>
    </main>
  );
}
