import React, { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip, // Renamed to avoid conflict
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
  BarChart,
  Repeat,
  Table,
  HelpCircle,
  Target,
  UserCheck,
} from "lucide-react";

// Main Simplified App Component
function App() {
  // --- STATE MANAGEMENT ---

  // --- Core Loan & Investment Inputs ---
  const [loanAmount, setLoanAmount] = useState(5000000); // ₹50 Lakhs
  const [interestRate, setInterestRate] = useState(9.0); // 9.0%
  const [tenureYears, setTenureYears] = useState(20); // 20 years
  const [extraCash, setExtraCash] = useState(500000); // ₹5 Lakhs
  const [investmentReturn, setInvestmentReturn] = useState(12); // 12%
  const [investmentType, setInvestmentType] = useState("equity"); // 'equity' or 'fd'

  // --- Tax Inputs ---
  const [taxRegime, setTaxRegime] = useState("old"); // 'old' or 'new'
  const [taxSlab, setTaxSlab] = useState(30); // User's tax slab in percentage
  const [used80C, setUsed80C] = useState(150000); // How much of 80C is already used

  // --- Strategy Inputs ---
  const [prepaymentMethod, setPrepaymentMethod] = useState("reduceTenure"); // 'reduceEmi' or 'reduceTenure'

  // --- Calculation Results ---
  const [results, setResults] = useState(null);

  // --- CONSTANTS ---
  const SECTION_24B_SOP_LIMIT = 200000;
  const SECTION_80C_LIMIT = 150000;
  const EQUITY_LTCG_TAX_RATE = 0.1; // 10%
  const EQUITY_LTCG_EXEMPTION = 100000;

  // --- HELPER FUNCTIONS ---

  const calculateEMI = useCallback((p, r, n) => {
    if (p <= 0 || r <= 0 || n <= 0) return 0;
    const monthlyRate = r / 100 / 12;
    return (
      (p * monthlyRate * Math.pow(1 + monthlyRate, n)) /
      (Math.pow(1 + monthlyRate, n) - 1)
    );
  }, []);

  const calculateNewTenure = useCallback(
    (newPrincipal, originalEmi, annualRate) => {
      if (newPrincipal <= 0 || originalEmi <= 0 || annualRate <= 0) return 0;
      const monthlyRate = annualRate / 100 / 12;
      if (originalEmi <= newPrincipal * monthlyRate) return Infinity;
      const numerator = Math.log(
        1 - (newPrincipal * monthlyRate) / originalEmi
      );
      const denominator = Math.log(1 + monthlyRate);
      return Math.ceil(-numerator / denominator);
    },
    []
  );

  const generateFullAmortization = useCallback(
    (principal, annualRate, months, emi) => {
      if (principal <= 0 || emi <= 0) return [];
      const schedule = [];
      let balance = principal;
      const monthlyRate = annualRate / 100 / 12;
      for (let i = 1; i <= months; i++) {
        const interestForMonth = balance * monthlyRate;
        const principalForMonth = Math.max(0, emi - interestForMonth);
        balance -= principalForMonth;
        if (balance < 0) balance = 0;
        schedule.push({
          month: i,
          interest: interestForMonth,
          principal: principalForMonth,
          totalPayment: emi,
          endingBalance: balance,
        });
        if (balance === 0) break;
      }
      return schedule;
    },
    []
  );

  // --- MAIN CALCULATION LOGIC ---
  const analyzeLoan = useCallback(() => {
    // Parse inputs
    const p = parseFloat(loanAmount);
    const r = parseFloat(interestRate);
    const n = parseFloat(tenureYears) * 12;
    const cash = parseFloat(extraCash);
    const invReturn = parseFloat(investmentReturn);
    const slab = parseFloat(taxSlab) / 100;
    const available80C = Math.max(0, SECTION_80C_LIMIT - parseFloat(used80C));

    // --- Scenario 1: Continue Loan & Invest Extra Cash ---
    const originalEmi = calculateEMI(p, r, n);
    const originalAmortization = generateFullAmortization(p, r, n, originalEmi);
    const totalInterestOriginal = originalAmortization.reduce(
      (acc, row) => acc + row.interest,
      0
    );

    // Calculate post-tax investment gain
    const futureValue = cash * Math.pow(1 + invReturn / 100, tenureYears);
    const investmentGain = futureValue - cash;
    let postTaxInvestmentGain = 0;
    let investmentTax = 0;
    if (investmentType === "equity") {
      const taxableGain = Math.max(0, investmentGain - EQUITY_LTCG_EXEMPTION);
      investmentTax = taxableGain * EQUITY_LTCG_TAX_RATE;
      postTaxInvestmentGain = investmentGain - investmentTax;
    } else {
      // 'fd'
      investmentTax = investmentGain * slab;
      postTaxInvestmentGain = investmentGain - investmentTax;
    }

    // Calculate tax benefits for original loan (SOP only)
    let originalLoanTaxBenefit = 0;
    if (taxRegime === "old") {
      let yearlyData = [];
      let currentYear = 1;
      originalAmortization.forEach((monthData, i) => {
        if (!yearlyData[currentYear - 1])
          yearlyData[currentYear - 1] = {
            year: currentYear,
            interest: 0,
            principal: 0,
          };
        yearlyData[currentYear - 1].interest += monthData.interest;
        yearlyData[currentYear - 1].principal += monthData.principal;
        if ((i + 1) % 12 === 0) currentYear++;
      });
      yearlyData.forEach((year) => {
        const principalDeduction = Math.min(year.principal, available80C);
        const interestDeduction = Math.min(
          year.interest,
          SECTION_24B_SOP_LIMIT
        );
        const totalDeduction = principalDeduction + interestDeduction;
        originalLoanTaxBenefit += totalDeduction * slab;
      });
    }

    const netBenefitInvesting = postTaxInvestmentGain + originalLoanTaxBenefit;

    // --- Scenario 2: Prepay Loan ---
    const newLoanAmount = p - cash;
    let newEmi = originalEmi;
    let newTenureMonths = n;
    let interestSaved = 0;
    let prepaidAmortization = [];
    let prepaidLoanTaxBenefit = 0;

    if (newLoanAmount > 0) {
      if (prepaymentMethod === "reduceEmi") {
        newEmi = calculateEMI(newLoanAmount, r, n);
        newTenureMonths = n;
      } else {
        // 'reduceTenure'
        newEmi = originalEmi;
        newTenureMonths = calculateNewTenure(newLoanAmount, originalEmi, r);
      }
      prepaidAmortization = generateFullAmortization(
        newLoanAmount,
        r,
        newTenureMonths,
        newEmi
      );
      const totalInterestAfterPrepay = prepaidAmortization.reduce(
        (acc, row) => acc + row.interest,
        0
      );
      interestSaved = totalInterestOriginal - totalInterestAfterPrepay;

      // Calculate tax benefit for prepaid loan (SOP only)
      if (taxRegime === "old") {
        let yearlyData = [];
        let currentYear = 1;
        prepaidAmortization.forEach((monthData, i) => {
          if (!yearlyData[currentYear - 1])
            yearlyData[currentYear - 1] = {
              year: currentYear,
              interest: 0,
              principal: 0,
            };
          yearlyData[currentYear - 1].interest += monthData.interest;
          yearlyData[currentYear - 1].principal += monthData.principal;
          if ((i + 1) % 12 === 0) currentYear++;
        });
        yearlyData.forEach((year) => {
          const principalDeduction = Math.min(year.principal, available80C);
          const interestDeduction = Math.min(
            year.interest,
            SECTION_24B_SOP_LIMIT
          );
          const totalDeduction = principalDeduction + interestDeduction;
          prepaidLoanTaxBenefit += totalDeduction * slab;
        });
      }
    } else {
      // Loan fully paid off
      newEmi = 0;
      newTenureMonths = 0;
      interestSaved = totalInterestOriginal;
      prepaidLoanTaxBenefit = 0;
    }
    const netBenefitPrepaying = interestSaved + prepaidLoanTaxBenefit;

    // --- Final Decision ---
    const betterOption =
      netBenefitInvesting > netBenefitPrepaying ? "Invest" : "Prepay";
    const effectiveLoanRate = r * (1 - slab);

    // --- Graph Data ---
    const graphData = [];
    const maxYears = Math.ceil(
      Math.max(originalAmortization.length, prepaidAmortization.length) / 12
    );
    let cumulativeOriginalInterest = 0;
    let cumulativePrepaidInterest = 0;
    for (let year = 1; year <= maxYears; year++) {
      if (year <= tenureYears) {
        cumulativeOriginalInterest = originalAmortization
          .slice(0, year * 12)
          .reduce((acc, row) => acc + row.interest, 0);
      }
      if (year <= newTenureMonths / 12) {
        cumulativePrepaidInterest = prepaidAmortization
          .slice(0, year * 12)
          .reduce((acc, row) => acc + row.interest, 0);
      }
      const investmentValueAtYear = cash * Math.pow(1 + invReturn / 100, year);
      graphData.push({
        year,
        "Investment Value": parseFloat(investmentValueAtYear.toFixed(0)),
        "Interest (Original)": parseFloat(
          cumulativeOriginalInterest.toFixed(0)
        ),
        "Interest (Prepaid)": parseFloat(cumulativePrepaidInterest.toFixed(0)),
      });
    }

    // --- SET RESULTS ---
    setResults({
      originalEmi,
      newEmi,
      interestSaved,
      investmentGain,
      postTaxInvestmentGain,
      originalLoanTaxBenefit,
      prepaidLoanTaxBenefit,
      netBenefitInvesting,
      netBenefitPrepaying,
      betterOption,
      originalTenureMonths: n,
      newTenureMonths,
      effectiveLoanRate,
      graphData,
      originalAmortization,
      prepaidAmortization,
      investmentTax,
      taxSlab,
      investmentType,
    });
  }, [
    loanAmount,
    interestRate,
    tenureYears,
    extraCash,
    investmentReturn,
    taxRegime,
    taxSlab,
    investmentType,
    used80C,
    prepaymentMethod,
    calculateEMI,
    calculateNewTenure,
    generateFullAmortization,
  ]);

  useEffect(() => {
    analyzeLoan();
  }, [analyzeLoan]);
  const formatCurrency = (value) =>
    value.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-4 sm:p-8 font-inter text-gray-200">
      <div className="max-w-7xl mx-auto bg-gray-800 shadow-xl rounded-2xl overflow-hidden border border-yellow-500/20">
        <header className="bg-gray-900 text-yellow-400 p-6 text-center rounded-t-2xl border-b border-yellow-500/30">
          <h1 className="text-3xl sm:text-4xl font-extrabold flex items-center justify-center gap-3">
            <Home className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-500" /> Loan
            Prepayment Advisor
          </h1>
        </header>

        <Introduction />

        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 bg-gray-900 p-6 rounded-xl shadow-inner border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-yellow-400">
              Your Financial Scenario
            </h2>
            <div className="space-y-4">
              <InputGroup
                icon={DollarSign}
                label="Loan Amount (₹)"
                value={loanAmount}
                onChange={setLoanAmount}
              />
              <InputGroup
                icon={Percent}
                label="Interest Rate (%)"
                value={interestRate}
                onChange={setInterestRate}
                step="0.05"
              />
              <InputGroup
                icon={Calendar}
                label="Remaining Tenure (Yrs)"
                value={tenureYears}
                onChange={setTenureYears}
              />
              <InputGroup
                icon={Wallet}
                label="Extra Cash to Deploy (₹)"
                value={extraCash}
                onChange={setExtraCash}
              />
              <InputGroup
                icon={TrendingUp}
                label="Expected Return (%)"
                value={investmentReturn}
                onChange={setInvestmentReturn}
                step="0.5"
              />
              <RadioGroup
                label="Investment Type"
                name="investmentType"
                value={investmentType}
                onChange={setInvestmentType}
                options={[
                  { value: "equity", label: "Equity (Stocks/MF)" },
                  { value: "fd", label: "Fixed Deposit" },
                ]}
              />
              <RadioGroup
                label="Tax Regime"
                name="taxRegime"
                value={taxRegime}
                onChange={setTaxRegime}
                options={[
                  { value: "old", label: "Old Regime" },
                  { value: "new", label: "New Regime" },
                ]}
              />
              {taxRegime === "old" && (
                <InputGroup
                  icon={Percent}
                  label="Your Tax Slab (%)"
                  value={taxSlab}
                  onChange={setTaxSlab}
                />
              )}
              {taxRegime === "old" && (
                <InputGroup
                  icon={BarChart}
                  label="Used 80C Limit (₹)"
                  value={used80C}
                  onChange={setUsed80C}
                />
              )}
              <RadioGroup
                label="Prepayment Method"
                name="prepaymentMethod"
                value={prepaymentMethod}
                onChange={setPrepaymentMethod}
                options={[
                  { value: "reduceTenure", label: "Reduce Tenure" },
                  { value: "reduceEmi", label: "Reduce EMI" },
                ]}
              />
            </div>
          </div>

          <div className="lg:col-span-3 bg-gray-900 p-6 rounded-xl shadow-lg border border-yellow-500/30">
            <h2 className="text-2xl font-bold mb-6 text-yellow-400">
              📊 Analysis & Recommendation
            </h2>
            {results && (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg text-center ${
                    results.betterOption === "Invest"
                      ? "bg-green-900/50 border-green-500"
                      : "bg-red-900/50 border-red-500"
                  } border`}
                >
                  <h3 className="text-2xl font-bold flex items-center justify-center gap-2">
                    {results.betterOption === "Invest" ? (
                      <CheckCircle className="text-green-400" />
                    ) : (
                      <XCircle className="text-red-400" />
                    )}
                    Recommendation: {results.betterOption}
                  </h3>
                  <p className="mt-1 text-gray-300">
                    Net benefit of <strong>Investing</strong> is{" "}
                    <strong>
                      ₹{formatCurrency(results.netBenefitInvesting)}
                    </strong>{" "}
                    vs. Net benefit of <strong>Prepaying</strong> is{" "}
                    <strong>
                      ₹{formatCurrency(results.netBenefitPrepaying)}
                    </strong>
                    .
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <MetricCard
                    title="Post-Tax Investment Gain"
                    value={`₹${formatCurrency(results.postTaxInvestmentGain)}`}
                    color="purple"
                    tooltipText={`Gross Gain: ₹${formatCurrency(
                      results.investmentGain
                    )}\nTax Paid: ₹${formatCurrency(results.investmentTax)}\n(${
                      results.investmentType === "equity"
                        ? `10% LTCG`
                        : `${results.taxSlab}% Slab Rate`
                    })`}
                  />
                  <MetricCard
                    title="Net Interest Saved"
                    value={`₹${formatCurrency(results.interestSaved)}`}
                    color="green"
                    tooltipText="This is the total loan interest you avoid paying by reducing the principal amount upfront."
                  />
                  <MetricCard
                    title="Tax Benefit (Continue Loan)"
                    value={`₹${formatCurrency(results.originalLoanTaxBenefit)}`}
                    color="blue"
                    tooltipText="Total tax saved over the loan tenure from interest and principal deductions if you DON'T prepay."
                  />
                  <MetricCard
                    title="Tax Benefit (Prepaid Loan)"
                    value={`₹${formatCurrency(results.prepaidLoanTaxBenefit)}`}
                    color="blue"
                    tooltipText="Total tax saved on the remaining loan if you DO prepay. This is often lower as the loan amount is smaller."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                  <div>
                    <h4 className="font-semibold text-yellow-400">
                      Original Loan
                    </h4>
                    <p>EMI: ₹{formatCurrency(results.originalEmi)}</p>
                    <p>Tenure: {results.originalTenureMonths} months</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-yellow-400">
                      Loan After Prepayment
                    </h4>
                    <p>New EMI: ₹{formatCurrency(results.newEmi)}</p>
                    <p>
                      New Tenure: {Math.ceil(results.newTenureMonths)} months (
                      {(results.newTenureMonths / 12).toFixed(1)} yrs)
                    </p>
                  </div>
                </div>
                {taxRegime === "old" && (
                  <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                    <Tooltip
                      text={`Formula: ${interestRate}% * (1 - ${taxSlab}%)`}
                    >
                      <p className="cursor-help">
                        Effective Loan Rate (after tax):{" "}
                        <strong>{results.effectiveLoanRate.toFixed(2)}%</strong>{" "}
                        (Nominal: {interestRate}%)
                      </p>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {results && (
          <div className="p-6 sm:p-8 bg-gray-800 rounded-b-2xl border-t border-yellow-500/30">
            <h2 className="text-2xl font-bold mb-6 text-yellow-400 flex items-center gap-2">
              <BarChart /> Financial Trajectory
            </h2>
            <div className="h-80 w-full mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={results.graphData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#4a4a4a" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: "#d1d5db" }}
                    label={{
                      value: "Year",
                      position: "insideBottom",
                      offset: -5,
                      fill: "#d1d5db",
                    }}
                  />
                  <YAxis
                    tick={{ fill: "#d1d5db" }}
                    tickFormatter={(value) =>
                      `₹${(value / 100000).toFixed(0)}L`
                    }
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#333",
                      borderColor: "#555",
                      color: "#eee",
                    }}
                    formatter={(value) => `₹${formatCurrency(value)}`}
                  />
                  <Legend wrapperStyle={{ color: "#d1d5db" }} />
                  <Line
                    type="monotone"
                    dataKey="Investment Value"
                    stroke="#facc15"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="Interest (Original)"
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="Interest (Prepaid)"
                    stroke="#22c55e"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <h2 className="text-2xl font-bold mb-6 text-yellow-400 flex items-center gap-2">
              <Table /> Amortization Schedules
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <AmortizationTable
                title="Original Loan Schedule"
                data={results.originalAmortization}
              />
              <AmortizationTable
                title="Prepaid Loan Schedule"
                data={results.prepaidAmortization}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

const Introduction = () => (
  <div className="p-6 sm:p-8 bg-gray-800/50 border-y border-yellow-500/20">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border-2 border-yellow-500 text-yellow-400 mb-3">
          <Target size={32} />
        </div>
        <h3 className="text-xl font-bold text-yellow-400 mb-2">
          WHAT is this?
        </h3>
        <p className="text-gray-400 text-sm">
          A tool to resolve a common financial dilemma: Should you use extra
          cash to prepay your home loan or invest it for higher returns?
        </p>
      </div>
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border-2 border-yellow-500 text-yellow-400 mb-3">
          <TrendingUp size={32} />
        </div>
        <h3 className="text-xl font-bold text-yellow-400 mb-2">WHY use it?</h3>
        <p className="text-gray-400 text-sm">
          It quantifies the "opportunity cost". Prepaying gives guaranteed
          savings, while investing offers potential for wealth creation. This
          tool compares the net financial impact of both choices, including
          complex tax implications.
        </p>
      </div>
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border-2 border-yellow-500 text-yellow-400 mb-3">
          <UserCheck size={32} />
        </div>
        <h3 className="text-xl font-bold text-yellow-400 mb-2">
          WHO is it for?
        </h3>
        <p className="text-gray-400 text-sm">
          Any homeowner with a lump sum amount (from a bonus, sale, etc.) who
          wants to make a data-driven decision to either reduce their debt or
          grow their wealth.
        </p>
      </div>
    </div>
  </div>
);

const Tooltip = ({ text, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute bottom-full mb-2 w-max max-w-xs p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 border border-yellow-500 whitespace-pre-wrap">
      {text}
    </div>
  </div>
);

const InputGroup = ({ icon: Icon, label, value, onChange, step = 1 }) => (
  <div>
    <label className="block text-gray-300 text-sm font-semibold mb-2 flex items-center">
      <Icon className="w-4 h-4 mr-2 text-yellow-500" /> {label}
    </label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      step={step}
      className="w-full p-2 border-none focus:ring-2 focus:ring-yellow-500 rounded-md bg-gray-800 text-gray-200 font-medium"
    />
  </div>
);

const RadioGroup = ({ label, name, value, onChange, options }) => (
  <div>
    <label className="block text-gray-300 text-sm font-semibold mb-2 flex items-center">
      <Info className="w-4 h-4 mr-2 text-yellow-500" /> {label}
    </label>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`inline-flex items-center cursor-pointer p-2 rounded-md transition-colors duration-200 ${
            value === opt.value
              ? "bg-yellow-500 text-black"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
          />
          <span className="font-medium text-sm">{opt.label}</span>
        </label>
      ))}
    </div>
  </div>
);

const MetricCard = ({ title, value, color, tooltipText }) => {
  const colors = {
    purple: "from-purple-600/20 to-gray-800 border-purple-500 text-purple-400",
    green: "from-green-600/20 to-gray-800 border-green-500 text-green-400",
    blue: "from-blue-600/20 to-gray-800 border-blue-500 text-blue-400",
  };
  return (
    <div
      className={`p-4 bg-gradient-to-br ${colors[color]} border rounded-lg relative group`}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-300">{title}</h4>
        {tooltipText && (
          <Tooltip text={tooltipText}>
            <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
          </Tooltip>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
};

const AmortizationTable = ({ title, data }) => (
  <div>
    <h3 className="text-xl font-semibold mb-2 text-yellow-500">{title}</h3>
    {data.length > 0 ? (
      <div className="h-96 overflow-y-auto bg-gray-900 rounded-lg p-2 border border-gray-700">
        <table className="w-full text-xs text-left">
          <thead className="sticky top-0 bg-gray-900">
            <tr>
              <th className="p-2">Month</th>
              <th className="p-2">Interest</th>
              <th className="p-2">Principal</th>
              <th className="p-2">Balance</th>
            </tr>
          </thead>
          <tbody className="text-gray-400">
            {data.map((row) => (
              <tr key={row.month} className="border-t border-gray-800">
                <td className="p-2">{row.month}</td>
                <td className="p-2">
                  ₹
                  {row.interest.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="p-2">
                  ₹
                  {row.principal.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="p-2 font-semibold text-gray-300">
                  ₹
                  {row.endingBalance.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-gray-500">
        Loan is fully paid off. No schedule to show.
      </p>
    )}
  </div>
);

export default App;
