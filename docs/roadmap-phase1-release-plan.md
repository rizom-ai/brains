# Roadmap: Phase 1 Release Plan

## Overview

This document outlines the roadmap for completing Phase 1 of the Brain system, culminating in Release v1.0. The plan focuses on delivering visible improvements through progress UI enhancements while establishing a clean architectural foundation for future MCP client work.

## Strategic Goals

1. **Create a polished, demo-ready release** for external stakeholders
2. **Complete all in-progress work** before starting new architectural changes
3. **Establish clean package structure** for sustainable development
4. **Deliver immediate user value** through progress UI improvements

## Phase 1: Package Extraction + Progress UI (Weeks 1-4)

### Week 1-2: Message Interface Package Extraction

**Objective**: Create clean architecture without behavioral changes

**Tasks**:

- [ ] Create new `@brains/message-interface` package
- [ ] Move `MessageInterfacePlugin` from `@brains/plugin-utils`
- [ ] Move related types (Command, MessageContext, etc.)
- [ ] Update all interface imports (CLI, Matrix)
- [ ] Ensure all tests pass with new structure
- [ ] Update documentation for new package

**Deliverables**:

- New package published to workspace
- Zero behavioral changes
- All interfaces working identically
- Clean separation of concerns achieved

### Week 3-4: Progress UI Enhancements (Phase 4)

**Objective**: Implement beautiful, informative progress displays

**Architectural Note**: To avoid code duplication and ensure consistency, progress logic (ETA calculations, throttling, utilities) is being extracted to the shared message-interface package first, then both CLI and Matrix will use this shared foundation.

**CLI Enhancements**:

- [x] Multi-line progress bars for batch operations
- [x] Current operation details display
- [x] ETA and processing rate calculations
- [x] Different rendering for batch vs individual jobs
- [x] Smart aggregation for directory sync (e.g., "Syncing: 15/40 files")

**Shared Progress Logic Extraction**:

- [x] Extract ETA and rate calculations from CLI to job-queue package
- [x] Extract batch update throttling logic to job-queue package
- [x] Move progress utilities and operation detection to shared package
- [x] Update CLI to use shared progress utilities

**Enum-Based Operation Architecture**:

- [x] Update JobProgressEvent schema with Zod enum for operation types
- [x] Add type-safe aggregation logic to progressReducer
- [x] Update job creators to use structured operation types
- [x] Remove CLI string-based aggregation logic
- [x] Enable consistent operation aggregation across interfaces

**Matrix Enhancements** (depends on shared logic extraction):

- [ ] Richer progress messages with operation details
- [ ] Emoji indicators for different operation types
- [ ] Completion summaries
- [ ] Improved message editing for smoother updates
- [ ] Batched updates to reduce message spam

**Plugin Command Registration System**:

- [ ] Extend PluginCapabilities interface to include commands field
- [ ] Add command discovery to MessageInterfacePlugin base class
- [ ] Implement site-builder commands in SiteBuilderPlugin
- [ ] Enable `/generate-all`, `/build`, `/promote-all` commands via plugin registration
- [ ] Leverage existing progress tracking for automatic command progress display

**Testing & Polish**:

- [ ] Test all progress scenarios
- [ ] Ensure smooth animations in CLI
- [ ] Verify Matrix message updates don't spam
- [ ] Document new progress features

## 🚀 Release v1.0 - "Progress & Polish"

### Release Date: End of Week 4

### Release Contents

**User-Facing Features**:

- ✨ Beautiful multi-line progress bars in CLI
- 📊 Detailed operation tracking with ETA
- 🚀 Smart batch operation aggregation
- 📱 Rich progress messages in Matrix
- ⚡ Real-time progress updates
- 🎯 Clear operation status indicators
- 🔧 Plugin commands accessible in interfaces (`/generate-all`, `/build`, etc.)
- 🔄 Unified command access across CLI and Matrix interfaces

**Developer Improvements**:

- 📦 Clean package architecture (`@brains/message-interface`)
- 🧪 Comprehensive test coverage
- 📚 Updated documentation
- 🎨 Consistent UI patterns
- 🔧 Maintainable codebase

**Technical Achievements**:

- Completed Progress Notification Enhancement (Phases 1-3, 5 done, Phase 4 complete)
- Clean architectural separation
- All tests passing
- Performance optimized
- Production ready

### Demo Scenarios for Stakeholders

1. **Directory Sync Demo**
   - Show large directory sync with aggregated progress
   - Demonstrate real-time file counting
   - Display current file being processed

2. **Batch Content Generation**
   - Generate content for multiple pages
   - Show batch progress aggregation
   - Display individual operation details

3. **Multi-Interface Demo**
   - Run operations from CLI and Matrix simultaneously
   - Show isolated progress tracking
   - Demonstrate permission-based filtering

4. **Performance Showcase**
   - Process large batches efficiently
   - Show ETA accuracy
   - Demonstrate smooth UI updates

5. **Plugin Command Integration Demo**
   - Type `/generate-all` in CLI to trigger site generation
   - Show automatic progress tracking for command operations
   - Demonstrate same command working in Matrix interface
   - Showcase unified command access across all interfaces

### Success Criteria

- [ ] All progress features working smoothly
- [ ] Zero regressions from current functionality
- [ ] Clean package structure established
- [ ] All documentation updated
- [ ] Demo scenarios rehearsed and polished
- [ ] Stakeholder presentation ready

## Phase 2 Preview: MCP Client Architecture (Weeks 5-10)

**Starting from clean v1.0 codebase:**

### Key Insights

- **No shell changes required** - MCP server already exists
- **Isolated to message-interface package** - Clean boundaries
- **Enables AI tool access** - Natural language to tool execution
- **Per-interface approach** - CLI first, then Matrix

### High-Level Plan

1. Add MCP client capabilities to message-interface package
2. Migrate CLI to use MCP client mode
3. Migrate Matrix with per-user sessions
4. Enable AI-powered tool discovery and execution
5. Create v2.0 release with full MCP integration

## Benefits of This Approach

1. **Clean Release Cycle**
   - v1.0 is stable and polished
   - Clear value for stakeholders
   - Strong foundation for v2.0

2. **Risk Management**
   - Complete in-progress work first
   - MCP changes isolated to Phase 2
   - Can always demo stable v1.0

3. **Stakeholder Value**
   - Immediate visible improvements
   - Professional, polished experience
   - Plugin command accessibility through simple commands
   - Consistent interface experience across CLI/Matrix
   - Clear roadmap for future

4. **Technical Excellence**
   - Clean architecture from the start
   - No technical debt accumulation
   - Sustainable development pace

## Timeline Summary

- **Weeks 1-2**: Package extraction (no behavior changes)
- **Weeks 3-4**: Progress UI implementation
- **End of Week 4**: v1.0 Release & Stakeholder Demo
- **Weeks 5-10**: MCP Client Architecture (Phase 2)

## Next Steps

1. Begin package extraction immediately
2. Create progress UI designs/mockups
3. Schedule stakeholder demo for end of Week 4
4. Prepare demo environment and scenarios
5. Document all changes thoroughly

This roadmap delivers maximum value while maintaining architectural cleanliness and setting up perfectly for the exciting MCP client work in Phase 2.
