"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  formatLabel?: (v: number) => string;
  label: string;
};

function snapToStep(value: number, min: number, max: number, step: number): number {
  if (max <= min) return min;
  const k = Math.round((value - min) / step);
  const snapped = min + k * step;
  return Math.max(min, Math.min(max, snapped));
}

export function RangeSlider({
  min,
  max,
  step = 1,
  minValue,
  maxValue,
  onChange,
  formatLabel,
  label,
}: RangeSliderProps) {
  const [localMin, setLocalMin] = useState(minValue);
  const [localMax, setLocalMax] = useState(maxValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelId = useId();

  useEffect(() => {
    setLocalMin(minValue);
    setLocalMax(maxValue);
  }, [minValue, maxValue]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const scheduleOnChange = useCallback(
    (nextMin: number, nextMax: number) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onChange(nextMin, nextMax);
      }, 300);
    },
    [onChange]
  );

  const fmt = useMemo(
    () => formatLabel ?? ((v: number) => String(v)),
    [formatLabel]
  );

  const span = max - min;
  const safeSpan = span > 0 ? span : 1;

  const minPct = span > 0 ? ((localMin - min) / safeSpan) * 100 : 0;
  const maxPct = span > 0 ? ((localMax - min) / safeSpan) * 100 : 100;

  const isDefault = localMin === min && localMax === max;

  const minZ = localMin > max - localMin ? 2 : 4;
  const maxZ = localMin <= max - localMin ? 2 : 4;

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const snapped = snapToStep(raw, min, max, step);
    const next = Math.max(min, Math.min(snapped, localMax));
    setLocalMin(next);
    scheduleOnChange(next, localMax);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const snapped = snapToStep(raw, min, max, step);
    const next = Math.min(max, Math.max(snapped, localMin));
    setLocalMax(next);
    scheduleOnChange(localMin, next);
  };

  return (
    <div
      className={`range-slider${isDefault ? "" : " range-slider--active"}`}
      role="group"
      aria-labelledby={labelId}
    >
      <div id={labelId} className="range-slider-label">
        {label}
      </div>

      <div className="range-slider-track">
        <div
          className="range-slider-values"
          aria-hidden="true"
        >
          <span
            className="range-slider-value range-slider-value--min"
            style={{ left: `${minPct}%` }}
          >
            {fmt(localMin)}
          </span>
          <span
            className="range-slider-value range-slider-value--max"
            style={{ left: `${maxPct}%` }}
          >
            {fmt(localMax)}
          </span>
        </div>

        <input
          type="range"
          className="range-slider-input range-slider-input--min"
          style={{ zIndex: minZ }}
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={handleMinChange}
          aria-label={`${label} minimum`}
        />
        <input
          type="range"
          className="range-slider-input range-slider-input--max"
          style={{ zIndex: maxZ }}
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={handleMaxChange}
          aria-label={`${label} maximum`}
        />
      </div>
    </div>
  );
}
