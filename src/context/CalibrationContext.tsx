"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { CalibrationConfig, DEFAULT_CALIBRATION } from "@/lib/resume/types";

interface CalibrationContextValue {
  calibration: CalibrationConfig;
  setCalibration: (config: CalibrationConfig) => void;
  setOneLineMax: (n: number) => void;
  setTwoLineMax: (n: number) => void;
  resetToDefault: () => void;
  isCalibrated: boolean;
}

const STORAGE_KEY = "hireme_resume_calibration";

const CalibrationContext = createContext<CalibrationContextValue | null>(null);

export function CalibrationProvider({
  children,
  initialCalibration,
  onCalibrationChange,
}: {
  children: React.ReactNode;
  initialCalibration?: CalibrationConfig;
  onCalibrationChange?: (cfg: CalibrationConfig) => void;
}) {
  const [calibration, setInternalCalibration] = useState<CalibrationConfig>(() => {
    if (initialCalibration) return initialCalibration;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      } catch {
        // fallback
      }
    }
    return DEFAULT_CALIBRATION;
  });

  const [isCalibrated, setIsCalibrated] = useState(false);

  useEffect(() => {
    if (initialCalibration) {
      setInternalCalibration(initialCalibration);
      setIsCalibrated(true);
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setInternalCalibration(JSON.parse(stored));
        setIsCalibrated(true);
      }
    } catch {
      // fallback
    }
  }, [initialCalibration]);

  const update = (next: CalibrationConfig) => {
    setInternalCalibration(next);
    setIsCalibrated(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    onCalibrationChange?.(next);
  };

  const setOneLineMax = (n: number) => {
    const valid = Math.max(20, Math.min(300, Math.round(n)));
    // Automatically keep twoLineMax proportionally scaled if it was double
    const newTwoLine = calibration.twoLineMax <= calibration.oneLineMax * 2 + 5
      ? valid * 2
      : Math.max(valid + 20, calibration.twoLineMax);
    update({ oneLineMax: valid, twoLineMax: newTwoLine });
  };

  const setTwoLineMax = (n: number) => {
    const valid = Math.max(calibration.oneLineMax + 10, Math.min(600, Math.round(n)));
    update({ ...calibration, twoLineMax: valid });
  };

  const resetToDefault = () => {
    update(DEFAULT_CALIBRATION);
    setIsCalibrated(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <CalibrationContext.Provider
      value={{
        calibration,
        setCalibration: update,
        setOneLineMax,
        setTwoLineMax,
        resetToDefault,
        isCalibrated,
      }}
    >
      {children}
    </CalibrationContext.Provider>
  );
}

export function useCalibration() {
  const ctx = useContext(CalibrationContext);
  if (!ctx) {
    return {
      calibration: DEFAULT_CALIBRATION,
      setCalibration: () => {},
      setOneLineMax: () => {},
      setTwoLineMax: () => {},
      resetToDefault: () => {},
      isCalibrated: false,
    };
  }
  return ctx;
}
