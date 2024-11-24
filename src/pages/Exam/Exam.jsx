import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownSection,
    DropdownItem,
    Button,
} from "@nextui-org/react";

import Question from "./components/Question/Question";

import { useState, useEffect } from "react";

// Function to dynamically import all JSON files from the exams_questions folder
const importAll = async () => {
    const context = await import.meta.glob("../../exams_questions/*.json");
    const files = Object.keys(context).map((file) =>
        file.replace("../../exams_questions/", "").replace(".json", "")
    );
    return { context, files };
};

function Exam() {
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answeredQuestions, setAnsweredQuestions] = useState([]);
    const [selectedFile, setSelectedFile] = useState("");
    const [files, setFiles] = useState([]);

    useEffect(() => {
        importAll().then(({ context, files }) => {
            setFiles(files);
            window.context = context; // Save context to window for later use
            if (files.length > 0) {
                setSelectedFile(files[0]); // Set the first file as the default selected file
            }
        });
    }, []);

    useEffect(() => {
        if (selectedFile) {
            window.context[`../../exams_questions/${selectedFile}.json`]().then(
                (module) => {
                    const questionsData = module.default;
                    setQuestions(questionsData);
                    setCurrentQuestionIndex(
                        Math.floor(Math.random() * questionsData.length)
                    );
                }
            );
        }
    }, [selectedFile]);

    const nextQuestion = () => {
        const newAnsweredQuestions = [
            ...answeredQuestions,
            currentQuestionIndex,
        ];
        setAnsweredQuestions(newAnsweredQuestions);
        const remainingQuestions = questions.filter(
            (_, index) => !newAnsweredQuestions.includes(index)
        );
        if (remainingQuestions.length > 0) {
            const nextIndex = questions.indexOf(
                remainingQuestions[
                    Math.floor(Math.random() * remainingQuestions.length)
                ]
            );
            setCurrentQuestionIndex(nextIndex);
        } else {
            alert("No more questions available.");
        }
    };

    const changeExamFile = (exam_file) => {
        setSelectedFile(exam_file);
        setAnsweredQuestions([]);
    };

    return (
        <>
            <Dropdown>
                <DropdownTrigger>
                    <Button className="mb-4">
                        Seleccionar archivo de examen
                    </Button>
                </DropdownTrigger>
                <DropdownMenu onAction={(key) => changeExamFile(key)}>
                    {files.map((file) => (
                        <DropdownItem key={file}>{file}</DropdownItem>
                    ))}
                </DropdownMenu>
            </Dropdown>
            <span className="ml-4">
                {answeredQuestions.length}/{questions.length}
            </span>
            {questions.length > 0 && (
                <Question
                    question_data={questions[currentQuestionIndex]}
                    nextQuestion={nextQuestion}
                />
            )}
        </>
    );
}

export default Exam;
