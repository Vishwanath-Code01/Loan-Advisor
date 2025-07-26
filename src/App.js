import React, { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Home,
  DollarSign,
  Percent,
  Calendar,
  Wallet,
  TrendingUp,
  CheckCircle,
  XCircle,
  Info,
} from "lucide-react";

// Main App Component
function App() {
  // State variables for user inputs
  const [loanAmount, setLoanAmount] = useState(2500000); // ₹25 Lakhs
  const [interestRate, setInterestRate] = useState(8.5); // 8.5%
  const [tenureYears, setTenureYears] = useState(20); // 20 years
  const [extraCash, setExtraCash] = useState(100000); // ₹1 Lakh
  const [investmentReturn, setInvestmentReturn] = useState(12); // 12%
  const [taxRegime, setTaxRegime] = useState("old"); // 'old' or 'new'
  const [isSelfOccupied, setIsSelfOccupied] = useState(true); // true or false
  const [isJointLoan, setIsJointLoan] = useState(false); // true or false
  const [taxSlab, setTaxSlab] = useState(30); // User's tax slab in percentage

  // State variable for calculation results
  const [results, setResults] = useState(null);

  // Constants for tax deductions
  const SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON = 200000; // ₹2 Lakhs
  const SECTION_80C_LIMIT = 150000; // ₹1.5 Lakhs

  // Helper function to calculate EMI
  const calculateEMI = useCallback((principal, annualRate, months) => {
    if (principal <= 0 || annualRate <= 0 || months <= 0) return 0;
    const monthlyRate = annualRate / 100 / 12;
    return (
      (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1)
    );
  }, []);

  // Helper function to calculate future value of investment
  const calculateFutureValue = useCallback(
    (principal, annualReturnRate, months) => {
      if (principal <= 0 || annualReturnRate < 0 || months <= 0)
        return principal;
      const monthlyReturnRate = annualReturnRate / 100 / 12;
      return principal * Math.pow(1 + monthlyReturnRate, months);
    },
    []
  );

  // Helper function to calculate amortization schedule for annual tax deductions
  const getAmortizationSchedule = useCallback(
    (principal, annualRate, months) => {
      const monthlyRate = annualRate / 100 / 12;
      const emi = calculateEMI(principal, annualRate, months);
      let balance = principal;
      const schedule = [];
      let currentYearInterest = 0;
      let currentYearPrincipal = 0;
      let currentYear = 1;

      for (let i = 1; i <= months; i++) {
        const interestForMonth = balance * monthlyRate;
        const principalForMonth = emi - interestForMonth;
        balance -= principalForMonth;

        currentYearInterest += interestForMonth;
        currentYearPrincipal += principalForMonth;

        if (i % 12 === 0 || i === months) {
          // End of year or end of loan
          schedule.push({
            year: currentYear,
            annualInterest: currentYearInterest,
            annualPrincipal: currentYearPrincipal,
            remainingBalance: balance, // Include remaining balance for clarity
          });
          currentYearInterest = 0;
          currentYearPrincipal = 0;
          currentYear++;
        }
      }
      return schedule;
    },
    [calculateEMI]
  );

  // Main calculation logic
  const analyzeLoan = useCallback(() => {
    const currentLoanAmount = parseFloat(loanAmount);
    const currentInterestRate = parseFloat(interestRate);
    const currentTenureYears = parseFloat(tenureYears);
    const currentExtraCash = parseFloat(extraCash);
    const currentInvestmentReturn = parseFloat(investmentReturn);
    const currentTaxSlab = parseFloat(taxSlab);
    const totalMonths = currentTenureYears * 12;

    // --- Scenario 1: Continue Loan & Invest Extra Cash ---
    const originalEMI = calculateEMI(
      currentLoanAmount,
      currentInterestRate,
      totalMonths
    );
    const totalInterestOriginal = originalEMI * totalMonths - currentLoanAmount;
    const futureValueOfInvestment = calculateFutureValue(
      currentExtraCash,
      currentInvestmentReturn,
      totalMonths
    );
    const investmentGain = futureValueOfInvestment - currentExtraCash;

    // Calculate tax benefits for original loan (Old Regime only)
    let originalLoanTaxBenefit = 0;
    let originalLoanTotalDeductibleInterest = 0;
    let originalLoanTotalDeductiblePrincipal = 0;
    let originalLoanFirstYearDeductibleInterest = 0;
    let originalLoanFirstYearDeductiblePrincipal = 0;
    let effective24bLimitOriginal = 0;

    if (taxRegime === "old") {
      const originalAmortization = getAmortizationSchedule(
        currentLoanAmount,
        currentInterestRate,
        totalMonths
      );

      effective24bLimitOriginal = isSelfOccupied
        ? isJointLoan
          ? SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON * 2
          : SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON
        : originalAmortization[0]?.annualInterest || 0; // For rented, full interest is deductible (subject to 2L set-off)

      originalAmortization.forEach((yearData, index) => {
        let interestDeduction = yearData.annualInterest;
        let principalDeduction = yearData.annualPrincipal;

        // Apply 24(b) limit
        if (isSelfOccupied) {
          interestDeduction = Math.min(
            interestDeduction,
            effective24bLimitOriginal
          );
        }
        // For rented property, full interest is deductible, but loss set-off is limited to 2L.
        // The effective24bLimitOriginal for rented property is set to annualInterest to reflect full deductibility
        // for calculation purposes, with the explanation clarifying the set-off limit.

        // Apply 80C limit
        principalDeduction = Math.min(principalDeduction, SECTION_80C_LIMIT);

        originalLoanTotalDeductibleInterest += interestDeduction;
        originalLoanTotalDeductiblePrincipal += principalDeduction;

        if (index === 0) {
          // Capture first year's deductible amounts
          originalLoanFirstYearDeductibleInterest = interestDeduction;
          originalLoanFirstYearDeductiblePrincipal = principalDeduction;
        }
      });
      // Total tax benefit is the sum of deductible amounts multiplied by tax slab
      originalLoanTaxBenefit =
        (originalLoanTotalDeductibleInterest +
          originalLoanTotalDeductiblePrincipal) *
        (currentTaxSlab / 100);
    }

    // --- Scenario 2: Prepay Loan ---
    const newLoanAmount = currentLoanAmount - currentExtraCash;
    let newEMI = 0;
    let totalInterestAfterPrepay = 0;
    let interestSaved = 0;

    if (newLoanAmount > 0) {
      newEMI = calculateEMI(newLoanAmount, currentInterestRate, totalMonths);
      totalInterestAfterPrepay = newEMI * totalMonths - newLoanAmount;
      interestSaved = totalInterestOriginal - totalInterestAfterPrepay;
    } else {
      // Loan fully paid off
      newEMI = 0;
      totalInterestAfterPrepay = 0;
      interestSaved = totalInterestOriginal; // All original interest is saved
    }

    // Calculate tax benefits for prepaid loan scenario (Old Regime only)
    let prepaidLoanTaxBenefit = 0;
    let prepaidLoanTotalDeductibleInterest = 0;
    let prepaidLoanTotalDeductiblePrincipal = 0;
    let prepaidLoanFirstYearDeductibleInterest = 0;
    let prepaidLoanFirstYearDeductiblePrincipal = 0;
    let effective24bLimitPrepaid = 0;

    if (taxRegime === "old" && newLoanAmount > 0) {
      const prepaidAmortization = getAmortizationSchedule(
        newLoanAmount,
        currentInterestRate,
        totalMonths
      );

      effective24bLimitPrepaid = isSelfOccupied
        ? isJointLoan
          ? SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON * 2
          : SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON
        : prepaidAmortization[0]?.annualInterest || 0; // For rented, full interest is deductible (subject to 2L set-off)

      prepaidAmortization.forEach((yearData, index) => {
        let interestDeduction = yearData.annualInterest;
        let principalDeduction = yearData.annualPrincipal;

        if (isSelfOccupied) {
          interestDeduction = Math.min(
            interestDeduction,
            effective24bLimitPrepaid
          );
        }
        principalDeduction = Math.min(principalDeduction, SECTION_80C_LIMIT);

        prepaidLoanTotalDeductibleInterest += interestDeduction;
        prepaidLoanTotalDeductiblePrincipal += principalDeduction;

        if (index === 0) {
          // Capture first year's deductible amounts
          prepaidLoanFirstYearDeductibleInterest = interestDeduction;
          prepaidLoanFirstYearDeductiblePrincipal = principalDeduction;
        }
      });
      prepaidLoanTaxBenefit =
        (prepaidLoanTotalDeductibleInterest +
          prepaidLoanTotalDeductiblePrincipal) *
        (currentTaxSlab / 100);
    } else if (taxRegime === "old" && newLoanAmount <= 0) {
      // If loan is fully paid off, no more tax benefits from loan.
      prepaidLoanTaxBenefit = 0;
      prepaidLoanTotalDeductibleInterest = 0;
      prepaidLoanTotalDeductiblePrincipal = 0;
      prepaidLoanFirstYearDeductibleInterest = 0;
      prepaidLoanFirstYearDeductiblePrincipal = 0;
    }

    // --- Net Result Comparison ---
    // Total benefit from investing: Investment Gain + Tax Benefit from original loan
    const netBenefitInvesting = investmentGain + originalLoanTaxBenefit;

    // Total benefit from prepaying: Interest Saved + Tax Benefit from reduced loan
    const netBenefitPrepaying = interestSaved + prepaidLoanTaxBenefit;

    const betterOption =
      netBenefitInvesting > netBenefitPrepaying ? "Invest" : "Prepay";

    // Data for graph
    const graphData = [];
    let currentInvestmentValue = currentExtraCash;
    let currentOriginalInterest = 0;
    let currentPrepaidInterest = 0;

    const monthlyReturnRate = currentInvestmentReturn / 100 / 12;
    const originalMonthlyRate = currentInterestRate / 100 / 12;

    let originalBalance = currentLoanAmount;
    let prepaidBalance = newLoanAmount;

    for (let i = 1; i <= totalMonths; i++) {
      // Investment growth
      currentInvestmentValue *= 1 + monthlyReturnRate;

      // Original loan interest
      if (originalBalance > 0) {
        const interestThisMonthOriginal = originalBalance * originalMonthlyRate;
        const principalThisMonthOriginal =
          originalEMI - interestThisMonthOriginal;
        originalBalance -= principalThisMonthOriginal;
        currentOriginalInterest += interestThisMonthOriginal;
      }

      // Prepaid loan interest
      if (prepaidBalance > 0 && newEMI > 0) {
        const interestThisMonthPrepaid = prepaidBalance * originalMonthlyRate;
        const principalThisMonthPrepaid = newEMI - interestThisMonthPrepaid;
        prepaidBalance -= principalThisMonthPrepaid;
        currentPrepaidInterest += interestThisMonthPrepaid;
      } else if (newLoanAmount <= 0) {
        // If loan was fully paid off initially
        currentPrepaidInterest = 0;
      }

      if (i % 12 === 0 || i === totalMonths) {
        // Plot yearly data
        graphData.push({
          year: Math.ceil(i / 12),
          "Investment Value": parseFloat(currentInvestmentValue.toFixed(2)),
          "Cumulative Interest (Original Loan)": parseFloat(
            currentOriginalInterest.toFixed(2)
          ),
          "Cumulative Interest (Prepaid Loan)": parseFloat(
            currentPrepaidInterest.toFixed(2)
          ),
        });
      }
    }

    setResults({
      originalEMI: originalEMI,
      newEMI: newEMI,
      interestSaved: interestSaved,
      investmentGain: investmentGain,
      originalLoanTaxBenefit: originalLoanTaxBenefit,
      prepaidLoanTaxBenefit: prepaidLoanTaxBenefit,
      netBenefitInvesting: netBenefitInvesting,
      netBenefitPrepaying: netBenefitPrepaying,
      betterOption: betterOption,
      graphData: graphData,
      originalLoanTotalDeductibleInterest: originalLoanTotalDeductibleInterest,
      originalLoanTotalDeductiblePrincipal:
        originalLoanTotalDeductiblePrincipal,
      prepaidLoanTotalDeductibleInterest: prepaidLoanTotalDeductibleInterest,
      prepaidLoanTotalDeductiblePrincipal: prepaidLoanTotalDeductiblePrincipal,
      originalLoanFirstYearDeductibleInterest:
        originalLoanFirstYearDeductibleInterest,
      originalLoanFirstYearDeductiblePrincipal:
        originalLoanFirstYearDeductiblePrincipal,
      prepaidLoanFirstYearDeductibleInterest:
        prepaidLoanFirstYearDeductibleInterest,
      prepaidLoanFirstYearDeductiblePrincipal:
        prepaidLoanFirstYearDeductiblePrincipal,
      effective24bLimitOriginal: effective24bLimitOriginal,
      effective24bLimitPrepaid: effective24bLimitPrepaid,
    });
  }, [
    loanAmount,
    interestRate,
    tenureYears,
    extraCash,
    investmentReturn,
    taxRegime,
    isSelfOccupied,
    isJointLoan,
    taxSlab,
    calculateEMI,
    calculateFutureValue,
    getAmortizationSchedule,
  ]);

  // Run analysis when inputs change
  useEffect(() => {
    analyzeLoan();
  }, [analyzeLoan]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-4 sm:p-8 font-inter text-gray-200">
      <div className="max-w-6xl mx-auto bg-gray-800 shadow-xl rounded-2xl overflow-hidden border border-yellow-500/20">
        <header className="bg-gray-900 text-yellow-400 p-6 text-center rounded-t-2xl border-b border-yellow-500/30">
          <h1 className="text-3xl sm:text-4xl font-extrabold flex items-center justify-center gap-3">
            <Home className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-500" /> 1% Club
            • Loan Prepay Advisor
          </h1>
          <p className="mt-2 text-lg sm:text-xl font-light text-gray-300">
            Smart Home Loan Decision Advisor
          </p>
        </header>

        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="bg-gray-900 p-6 rounded-xl shadow-inner border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-yellow-400">
              Your Financial Details
            </h2>

            {/* Tax Regime */}
            <div className="mb-6">
              <label className="block text-gray-300 text-sm font-semibold mb-2 flex items-center">
                <Info className="w-4 h-4 mr-2 text-yellow-500" /> Choose Tax
                Regime:
              </label>
              <div className="flex space-x-4">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="taxRegime"
                    value="old"
                    checked={taxRegime === "old"}
                    onChange={() => setTaxRegime("old")}
                    className="form-radio h-5 w-5 text-yellow-500 rounded-full focus:ring-yellow-400 bg-gray-700 border-gray-600"
                  />
                  <span className="ml-2 text-gray-200 font-medium">
                    Old Regime
                  </span>
                </label>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="taxRegime"
                    value="new"
                    checked={taxRegime === "new"}
                    onChange={() => setTaxRegime("new")}
                    className="form-radio h-5 w-5 text-yellow-500 rounded-full focus:ring-yellow-400 bg-gray-700 border-gray-600"
                  />
                  <span className="ml-2 text-gray-200 font-medium">
                    New Regime
                  </span>
                </label>
              </div>
              {taxRegime === "new" && (
                <p className="text-sm text-red-400 mt-2 flex items-center">
                  <XCircle className="w-4 h-4 mr-1" /> New Tax Regime does NOT
                  allow deductions like Section 24(b) or 80C.
                </p>
              )}
            </div>

            {/* Property and Loan Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <label className="flex items-center cursor-pointer bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <input
                  type="checkbox"
                  checked={isSelfOccupied}
                  onChange={(e) => setIsSelfOccupied(e.target.checked)}
                  className="form-checkbox h-5 w-5 text-yellow-500 rounded focus:ring-yellow-400 bg-gray-800 border-gray-600"
                />
                <span className="ml-3 text-gray-200 font-medium">
                  Is the property Self-Occupied?
                </span>
              </label>
              <label className="flex items-center cursor-pointer bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <input
                  type="checkbox"
                  checked={isJointLoan}
                  onChange={(e) => setIsJointLoan(e.target.checked)}
                  className="form-checkbox h-5 w-5 text-yellow-500 rounded focus:ring-yellow-400 bg-gray-800 border-gray-600"
                />
                <span className="ml-3 text-gray-200 font-medium">
                  Is it a Joint Loan with Co-owner?
                </span>
              </label>
            </div>

            {/* Input Fields */}
            <div className="space-y-4">
              <div className="flex items-center bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <DollarSign className="w-5 h-5 text-gray-400 mr-3" />
                <label htmlFor="loanAmount" className="sr-only">
                  Outstanding Loan Amount (₹)
                </label>
                <input
                  type="number"
                  id="loanAmount"
                  value={loanAmount}
                  onChange={(e) =>
                    setLoanAmount(Math.max(0, parseFloat(e.target.value)))
                  }
                  className="flex-grow p-2 border-none focus:ring-0 rounded-md bg-gray-800 text-gray-200 font-medium"
                  placeholder="Outstanding Loan Amount (₹)"
                  aria-label="Outstanding Loan Amount"
                />
                <span className="text-gray-400">₹</span>
              </div>

              <div className="flex items-center bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <Percent className="w-5 h-5 text-gray-400 mr-3" />
                <label htmlFor="interestRate" className="sr-only">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  id="interestRate"
                  value={interestRate}
                  onChange={(e) =>
                    setInterestRate(Math.max(0, parseFloat(e.target.value)))
                  }
                  className="flex-grow p-2 border-none focus:ring-0 rounded-md bg-gray-800 text-gray-200 font-medium"
                  placeholder="Interest Rate (%)"
                  step="0.1"
                  aria-label="Interest Rate"
                />
                <span className="text-gray-400">%</span>
              </div>

              <div className="flex items-center bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <Calendar className="w-5 h-5 text-gray-400 mr-3" />
                <label htmlFor="tenureYears" className="sr-only">
                  Remaining Tenure (Years)
                </label>
                <input
                  type="number"
                  id="tenureYears"
                  value={tenureYears}
                  onChange={(e) =>
                    setTenureYears(Math.max(1, parseFloat(e.target.value)))
                  }
                  className="flex-grow p-2 border-none focus:ring-0 rounded-md bg-gray-800 text-gray-200 font-medium"
                  placeholder="Remaining Tenure (Years)"
                  aria-label="Remaining Tenure"
                />
                <span className="text-gray-400">Years</span>
              </div>

              <div className="flex items-center bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <Wallet className="w-5 h-5 text-gray-400 mr-3" />
                <label htmlFor="extraCash" className="sr-only">
                  Extra Cash You Have (₹)
                </label>
                <input
                  type="number"
                  id="extraCash"
                  value={extraCash}
                  onChange={(e) =>
                    setExtraCash(Math.max(0, parseFloat(e.target.value)))
                  }
                  className="flex-grow p-2 border-none focus:ring-0 rounded-md bg-gray-800 text-gray-200 font-medium"
                  placeholder="Extra Cash You Have (₹)"
                  aria-label="Extra Cash"
                />
                <span className="text-gray-400">₹</span>
              </div>

              <div className="flex items-center bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                <TrendingUp className="w-5 h-5 text-gray-400 mr-3" />
                <label htmlFor="investmentReturn" className="sr-only">
                  Expected Investment Return (%)
                </label>
                <input
                  type="number"
                  id="investmentReturn"
                  value={investmentReturn}
                  onChange={(e) =>
                    setInvestmentReturn(Math.max(0, parseFloat(e.target.value)))
                  }
                  className="flex-grow p-2 border-none focus:ring-0 rounded-md bg-gray-800 text-gray-200 font-medium"
                  placeholder="Expected Investment Return (%)"
                  step="0.1"
                  aria-label="Investment Return"
                />
                <span className="text-gray-400">%</span>
              </div>

              {taxRegime === "old" && (
                <div className="flex items-center bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600">
                  <Percent className="w-5 h-5 text-gray-400 mr-3" />
                  <label htmlFor="taxSlab" className="sr-only">
                    Your Tax Slab (%)
                  </label>
                  <input
                    type="number"
                    id="taxSlab"
                    value={taxSlab}
                    onChange={(e) =>
                      setTaxSlab(
                        Math.max(0, Math.min(100, parseFloat(e.target.value)))
                      )
                    }
                    className="flex-grow p-2 border-none focus:ring-0 rounded-md bg-gray-800 text-gray-200 font-medium"
                    placeholder="Your Tax Slab (%)"
                    step="1"
                    aria-label="Tax Slab"
                  />
                  <span className="text-gray-400">%</span>
                </div>
              )}
            </div>

            <button
              onClick={analyzeLoan}
              className="mt-8 w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-6 rounded-xl shadow-lg transform transition duration-300 ease-in-out hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:ring-opacity-50"
            >
              Analyze
            </button>
          </div>

          {/* Result Summary */}
          <div className="bg-gray-900 p-6 rounded-xl shadow-lg border border-yellow-500/30">
            <h2 className="text-2xl font-bold mb-6 text-yellow-400">
              📊 Result Summary
            </h2>
            {results && (
              <div className="space-y-4">
                <p className="text-lg flex justify-between items-center">
                  <span className="font-semibold text-gray-300">Old EMI:</span>
                  <span className="text-yellow-400">
                    ₹
                    {results.originalEMI.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>
                <p className="text-lg flex justify-between items-center">
                  <span className="font-semibold text-gray-300">
                    New EMI (after prepay ₹{extraCash.toLocaleString("en-IN")}):
                  </span>
                  <span className="text-yellow-400">
                    ₹
                    {results.newEMI.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>
                <p className="text-lg flex justify-between items-center">
                  <span className="font-semibold text-green-400">
                    🔻 Interest Saved over {tenureYears} yrs:
                  </span>
                  <span className="text-green-400 font-bold">
                    ₹
                    {results.interestSaved.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>

                {taxRegime === "old" && (
                  <>
                    <div className="border-t border-gray-700 pt-4 mt-4">
                      <p className="text-lg font-semibold text-blue-400 mb-2">
                        💡 Tax Benefits (Old Regime)
                      </p>
                      <p className="text-base flex justify-between items-center text-gray-300">
                        <span>Effective Section 24(b) Limit (Original):</span>
                        <span className="text-yellow-400">
                          ₹
                          {results.effective24bLimitOriginal.toLocaleString(
                            "en-IN",
                            { maximumFractionDigits: 2 }
                          )}
                        </span>
                      </p>
                      <p className="text-base flex justify-between items-center text-gray-300">
                        <span>
                          Annual Deductible Interest (Original - Sec 24b):
                        </span>
                        <span className="text-yellow-400">
                          ₹
                          {results.originalLoanFirstYearDeductibleInterest.toLocaleString(
                            "en-IN",
                            { maximumFractionDigits: 2 }
                          )}
                        </span>
                      </p>
                      <p className="text-base flex justify-between items-center text-gray-300">
                        <span>
                          Annual Deductible Principal (Original - Sec 80C):
                        </span>
                        <span className="text-yellow-400">
                          ₹
                          {results.originalLoanFirstYearDeductiblePrincipal.toLocaleString(
                            "en-IN",
                            { maximumFractionDigits: 2 }
                          )}
                        </span>
                      </p>
                      <p className="text-lg flex justify-between items-center mt-2">
                        <span className="font-semibold text-blue-400">
                          Total Tax Benefit (Original Loan):
                        </span>
                        <span className="text-blue-400 font-bold">
                          ₹
                          {results.originalLoanTaxBenefit.toLocaleString(
                            "en-IN",
                            { maximumFractionDigits: 2 }
                          )}
                        </span>
                      </p>
                    </div>

                    {results.newLoanAmount > 0 && ( // Only show prepaid tax benefits if loan is not fully paid off
                      <div className="border-t border-gray-700 pt-4 mt-4">
                        <p className="text-lg font-semibold text-blue-400 mb-2">
                          💡 Tax Benefits (Prepaid Loan)
                        </p>
                        <p className="text-base flex justify-between items-center text-gray-300">
                          <span>Effective Section 24(b) Limit (Prepaid):</span>
                          <span className="text-yellow-400">
                            ₹
                            {results.effective24bLimitPrepaid.toLocaleString(
                              "en-IN",
                              { maximumFractionDigits: 2 }
                            )}
                          </span>
                        </p>
                        <p className="text-base flex justify-between items-center text-gray-300">
                          <span>
                            Annual Deductible Interest (Prepaid - Sec 24b):
                          </span>
                          <span className="text-yellow-400">
                            ₹
                            {results.prepaidLoanFirstYearDeductibleInterest.toLocaleString(
                              "en-IN",
                              { maximumFractionDigits: 2 }
                            )}
                          </span>
                        </p>
                        <p className="text-base flex justify-between items-center text-gray-300">
                          <span>
                            Annual Deductible Principal (Prepaid - Sec 80C):
                          </span>
                          <span className="text-yellow-400">
                            ₹
                            {results.prepaidLoanFirstYearDeductiblePrincipal.toLocaleString(
                              "en-IN",
                              { maximumFractionDigits: 2 }
                            )}
                          </span>
                        </p>
                        <p className="text-lg flex justify-between items-center mt-2">
                          <span className="font-semibold text-blue-400">
                            Total Tax Benefit (Prepaid Loan):
                          </span>
                          <span className="text-blue-400 font-bold">
                            ₹
                            {results.prepaidLoanTaxBenefit.toLocaleString(
                              "en-IN",
                              { maximumFractionDigits: 2 }
                            )}
                          </span>
                        </p>
                      </div>
                    )}
                  </>
                )}

                <p className="text-lg flex justify-between items-center">
                  <span className="font-semibold text-purple-400">
                    📈 Investment Gain:
                  </span>
                  <span className="text-purple-400 font-bold">
                    ₹
                    {results.investmentGain.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>

                <div className="border-t border-gray-700 pt-4 mt-4">
                  <p className="text-xl font-bold flex justify-between items-center">
                    <span className="text-gray-200">Net Result:</span>
                    {results.betterOption === "Invest" ? (
                      <span className="text-green-400 flex items-center gap-2">
                        <CheckCircle className="w-6 h-6" /> Better to INVEST
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-2">
                        <XCircle className="w-6 h-6" /> Better to PREPAY
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    (Considering: Investment Gain + Tax Benefit from Original
                    Loan vs. Interest Saved + Tax Benefit from Prepaid Loan)
                  </p>
                </div>
              </div>
            )}
            {!results && (
              <p className="text-gray-400">
                Enter your details and click "Analyze" to see the results.
              </p>
            )}
          </div>
        </div>

        {/* Explanation Section */}
        <div className="p-6 sm:p-8 bg-gray-900 rounded-b-2xl border-t border-gray-700">
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">
            Understanding the Results (For Newbies!)
          </h2>
          <div className="space-y-4 text-gray-300">
            <p>
              This tool helps you decide whether to use your extra cash to pay
              off a part of your home loan (prepay) or to invest it elsewhere.
              Let's break down what each part means:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Old EMI:</strong> This is your current monthly payment
                for the home loan.
              </li>
              <li>
                <strong>New EMI (after prepay):</strong> If you use your extra
                cash to prepay, your outstanding loan amount reduces, and so
                does your monthly payment (EMI).
              </li>
              <li>
                <strong>Interest Saved:</strong> When you prepay, you reduce the
                principal amount you owe. This means you'll pay less interest
                over the remaining years of your loan. This is a direct saving!
              </li>
              <li>
                <strong>Investment Gain:</strong> If you choose not to prepay
                and instead invest your extra cash, this is how much profit you
                could potentially make from that investment over the same
                remaining loan tenure, based on your expected return rate.
              </li>
              {taxRegime === "old" && (
                <>
                  <li>
                    <strong>Tax Benefit (Old Regime only):</strong> This is
                    where it gets interesting! Under the Old Tax Regime, you can
                    save taxes on your home loan:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>
                        <strong>Section 24(b) - Interest Deduction:</strong> You
                        can deduct the interest you pay on your home loan from
                        your taxable income.
                        <ul className="list-disc list-inside ml-6 mt-1">
                          <li>
                            For <strong>Self-Occupied Property</strong>, the
                            maximum deduction is ₹
                            {SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON.toLocaleString(
                              "en-IN"
                            )}{" "}
                            per financial year.
                          </li>
                          <li>
                            For <strong>Let-Out (Rented) Property</strong>, the
                            entire interest can be deducted, but the "loss from
                            house property" that you can set off against other
                            income in a year is limited to ₹
                            {SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON.toLocaleString(
                              "en-IN"
                            )}
                            .
                          </li>
                          <li>
                            If it's a <strong>Joint Loan with Co-owner</strong>{" "}
                            and self-occupied, both co-owners can claim this
                            deduction individually, effectively doubling the
                            household's potential deduction (e.g., up to ₹
                            {(
                              SECTION_24B_SELF_OCCUPIED_LIMIT_PER_PERSON * 2
                            ).toLocaleString("en-IN")}{" "}
                            combined for self-occupied).
                          </li>
                        </ul>
                      </li>
                      <li>
                        <strong>Section 80C - Principal Repayment:</strong> The
                        principal amount you repay on your home loan is also
                        eligible for a deduction, up to a maximum of ₹
                        {SECTION_80C_LIMIT.toLocaleString("en-IN")} per
                        financial year, combined with other 80C investments.
                      </li>
                    </ul>
                    Your actual tax saving is this deductible amount multiplied
                    by your tax slab (e.g., if you're in the 30% slab, ₹100 of
                    deduction saves you ₹30 in tax).
                  </li>
                </>
              )}
              {taxRegime === "new" && (
                <li>
                  <strong>Tax Benefit (New Regime):</strong> Under the New Tax
                  Regime, there are NO deductions allowed for home loan interest
                  (Section 24b) or principal repayment (Section 80C).
                </li>
              )}
              <li>
                <strong>Net Result:</strong> This is the final comparison. We
                add up the "Interest Saved" and the "Tax Benefit from Prepaid
                Loan" to get the total benefit of prepaying. Then we compare it
                with the "Investment Gain" plus the "Tax Benefit from Original
                Loan". The option that gives you a higher overall financial
                advantage is recommended.
              </li>
            </ul>
            <p className="font-semibold text-yellow-400 mt-4">
              In simple terms, we're weighing the guaranteed savings from
              reducing your loan against the potential earnings from investing
              your money, keeping in mind how taxes affect each choice!
            </p>
          </div>
        </div>

        {/* Graph Section */}
        {results && (
          <div className="p-6 sm:p-8 bg-gray-800 rounded-b-2xl border-t border-yellow-500/30">
            <h2 className="text-2xl font-bold mb-6 text-yellow-400">
              📈 Financial Trajectory Over Time
            </h2>
            <div className="h-80 sm:h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={results.graphData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#4a4a4a" />{" "}
                  {/* Darker grid */}
                  <XAxis
                    dataKey="year"
                    label={{
                      value: "Year",
                      position: "insideBottom",
                      offset: 0,
                      fill: "#d1d5db",
                    }}
                    tick={{ fill: "#d1d5db" }}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      `₹${(value / 100000).toFixed(0)}L`
                    }
                    label={{
                      value: "Amount (₹)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#d1d5db",
                    }}
                    tick={{ fill: "#d1d5db" }}
                  />
                  <Tooltip
                    formatter={(value) =>
                      `₹${value.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}`
                    }
                    contentStyle={{
                      backgroundColor: "#333",
                      borderColor: "#555",
                      color: "#eee",
                    }}
                    labelStyle={{ color: "#yellow-400" }}
                  />
                  <Legend wrapperStyle={{ color: "#d1d5db" }} />{" "}
                  {/* Legend text color */}
                  <Line
                    type="monotone"
                    dataKey="Investment Value"
                    stroke="#facc15"
                    activeDot={{ r: 8 }}
                    strokeWidth={2}
                  />{" "}
                  {/* Gold */}
                  <Line
                    type="monotone"
                    dataKey="Cumulative Interest (Original Loan)"
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                  />{" "}
                  {/* Red for original interest */}
                  <Line
                    type="monotone"
                    dataKey="Cumulative Interest (Prepaid Loan)"
                    stroke="#22c55e"
                    strokeDasharray="3 3"
                    strokeWidth={2}
                  />{" "}
                  {/* Green for prepaid interest */}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-gray-400 mt-4 text-center">
              This graph shows how your investment grows over time versus the
              cumulative interest you would pay on your original loan and the
              loan after prepayment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
