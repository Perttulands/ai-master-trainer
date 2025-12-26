import { cn } from '../../utils/cn';

interface ScoreSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function ScoreSlider({ value, onChange, disabled = false }: ScoreSliderProps) {
  const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
      <div className="flex gap-1">
        {scores.map((score) => (
          <button
            key={score}
            onClick={() => onChange(score)}
            disabled={disabled}
            className={cn(
              'flex-1 h-8 rounded text-sm font-medium transition-all',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              value === score
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              score <= 3 && value === score && 'bg-red-500',
              score >= 4 && score <= 6 && value === score && 'bg-yellow-500',
              score >= 7 && value === score && 'bg-green-500'
            )}
          >
            {score}
          </button>
        ))}
      </div>
      {value && (
        <div className="text-center text-sm">
          <span className="font-medium">Score: {value}</span>
          <span className="text-gray-500">/10</span>
        </div>
      )}
    </div>
  );
}
