import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Target,
  BrainCircuit,
  GitBranch,
  Check,
  ListChecks
} from "lucide-react";
import { Button, Card } from "../ui";

interface TutorialDemoProps {
  onComplete?: () => void;
}

export function TutorialDemo({ onComplete }: TutorialDemoProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "1. Define Your Goal",
      description: "Describe what you need, add constraints, and provide context. The Master Trainer handles the rest.",
      icon: Target,
      content: (
        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100 text-left">
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">What do you need?</div>
            <div className="p-2.5 bg-white border border-gray-200 rounded-md text-sm text-gray-800 shadow-sm">
              Explain quantum computing to a 5-year-old
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Constraints</div>
              <div className="p-2 bg-white border border-gray-200 rounded-md text-xs text-gray-600 h-full">
                • Use simple analogies<br/>
                • Under 100 words
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Rubric</div>
              <div className="p-2 bg-white border border-gray-200 rounded-md text-xs text-gray-600 h-full flex items-center gap-2">
                <ListChecks className="w-3 h-3 text-primary-500" />
                <span>Clarity, Tone, Accuracy</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "2. Master Trainer Co-Pilot",
      description: "The Master Trainer analyzes your request and proposes diverse strategies to explore the solution space.",
      icon: BrainCircuit,
      content: (
        <div className="relative p-4 bg-gray-50 rounded-lg border border-gray-100 h-48 flex items-center justify-center overflow-hidden">
          <div className="w-[320px] h-full relative mx-auto">
            {/* Master Node */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border-2 border-primary-500 shadow-md z-10">
                <BrainCircuit className="w-6 h-6 text-primary-600" />
              </div>
              <span className="text-xs font-bold mt-1 text-primary-700">Master Trainer</span>
            </div>

            {/* Connecting Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <path d="M160 64 L 56 122" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 4" />
              <path d="M160 64 L 160 122" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 4" />
              <path d="M160 64 L 264 122" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 4" />
            </svg>

            {/* Agent Nodes */}
            <div className="absolute bottom-4 w-full flex justify-center gap-6 px-4">
              <div className="flex flex-col items-center w-20">
                <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm mb-1">
                  <span className="text-sm">🎓</span>
                </div>
                <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">Academic Strategy</span>
              </div>
              <div className="flex flex-col items-center w-20">
                <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm mb-1">
                  <span className="text-sm">🎨</span>
                </div>
                <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">Creative Strategy</span>
              </div>
              <div className="flex flex-col items-center w-20">
                <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm mb-1">
                  <span className="text-sm">📊</span>
                </div>
                <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">Analyst Strategy</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "3. Iterative Evolution",
      description: "Review outputs, score them, and give directives. The Master Trainer uses your feedback to evolve better agents.",
      icon: GitBranch,
      content: (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-4">
          {/* Gen 1 */}
          <div className="flex items-start gap-3 opacity-60">
            <div className="mt-1 w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">1</div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Initial Draft</span>
                <span className="text-xs font-bold text-orange-500">Score: 4/10</span>
              </div>
              <div className="text-[10px] text-gray-500 bg-white p-1.5 rounded border border-gray-200">
                "Too complex for a 5-year-old. Use simpler words."
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center -my-1">
            <div className="h-4 w-0.5 bg-gray-300"></div>
          </div>

          {/* Gen 2 */}
          <div className="flex items-start gap-3">
            <div className="mt-1 w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">2</div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-900">Evolved Agent</span>
                <span className="text-xs font-bold text-green-600">Score: 9/10</span>
              </div>
              <div className="text-[10px] text-gray-600 bg-white p-1.5 rounded border border-primary-200 shadow-sm">
                "Imagine a library where books can be in two places at once..."
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete?.();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const CurrentIcon = steps[currentStep].icon;

  return (
    <Card className="max-w-md mx-auto overflow-hidden border-gray-200 shadow-lg bg-white">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-50 rounded-lg">
            <CurrentIcon className="w-5 h-5 text-primary-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{steps[currentStep].title}</h3>
            <p className="text-xs text-gray-500">Step {currentStep + 1} of {steps.length}</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-6 min-h-[40px] text-left">
          {steps[currentStep].description}
        </p>

        {/* Visual Content */}
        <div className="mb-8">
          {steps[currentStep].content}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentStep ? "bg-primary-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="text-gray-500"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            
            <Button
              size="sm"
              onClick={handleNext}
              className="gap-2"
            >
              {currentStep === steps.length - 1 ? (
                <>
                  Start Creating
                  <Check className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
