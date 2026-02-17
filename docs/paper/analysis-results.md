# Results

## Dataset Overview

We analyzed 208 autonomous coding task executions across 12 software projects. Of these, 116 (55.8%) completed successfully, while 92 (44.2%) did not reach completion.

Tasks were executed using two merge strategies: pull request mode (n=116) and direct merge mode (n=92).

Three agent configurations were observed: claude-sonnet-4-20250514 (n=81), glm-4.7 (n=82), unknown (n=45).

## Success Rate Analysis

### By Project

Success rates varied substantially across projects, ranging from 6% to 100% (Figure 1). 
The highest completion rate was observed in vaos-executor (100%, n=1), while cybernetic-system showed the lowest rate (6%, n=32).

### By Merge Mode

- **direct** mode: 75.0% success rate (n=92)
- **pr** mode: 40.5% success rate (n=116)

A chi-squared test revealed a statistically significant association between merge mode and task success ($\chi^2$=23.35, p=0.0000) (Figure 2).

### By Agent Model

- **claude-sonnet-4-20250514**: 71.6% (n=81)
- **glm-4.7**: 64.6% (n=82)
- **unknown**: 11.1% (n=45)

## Duration Analysis

Among 116 completed tasks, 95 had durations under 24 hours (excluding tasks with extended idle periods between phases). Median completion time was 60 minutes (mean=224 min, IQR=23--360 min) (Figure 3).

For the 49 items with full phase timing data, pre-implementation phases (research + planning) consumed a median of 96 minutes, while implementation took a median of 4 minutes (Figure 7).

## Story Completion Rates

Of 132 tasks with PRD-defined user stories, the mean story completion rate was 0.95 (SD=0.21).

Successful tasks showed significantly higher story completion rates (median=1.00) compared to failed tasks (median=1.00) (Mann-Whitney U, p=0.1352) (Figure 4).

## Failure Analysis

The 92 unsuccessful tasks terminated in the following states:

- **idea**: 76 (83%)
- **implementing**: 11 (12%)
- **critique**: 2 (2%)
- **researched**: 2 (2%)
- **planned**: 1 (1%)

Of failed tasks, 5 (5%) had recorded error messages. The majority of failures (occurred before implementation began (Figure 6).

## Predictive Modeling

Logistic regression achieved a cross-validated AUC of 0.935 (SD=0.053), while random forest achieved AUC of 0.927 (SD=0.060) for predicting task success from execution metrics (Figures 9--10).

The top predictive features were:

- **stories_total**: importance=0.223
- **has_prd**: importance=0.193
- **has_progress_log**: importance=0.145
- **stories_done**: importance=0.141
- **agent_model_enc**: importance=0.107

## Iteration Patterns

Among 108 tasks that entered the implementation phase, a median of 1 iterations were required (mean=1.7, range=1--25) (Figure 8).

## Critique Phase Analysis

The adversarial critique phase was active for 13 tasks. The mean rejection rate was 0.66 (SD=0.39), with a total of 25 rejections and 10 approvals across all critiqued tasks.
