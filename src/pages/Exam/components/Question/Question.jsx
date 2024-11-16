import {
    Card,
    CardBody,
    Button,
    CheckboxGroup,
    Checkbox,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
} from "@nextui-org/react";

import { useState, useEffect } from "react";

import { EmblaCarousel } from "./components/EmblaCarousel/EmblaCarousel";

function Question({ question_data, nextQuestion }) {
    const { question, answers, explanation, images } = question_data;
    const [selectedAnswers, setSelectedAnswers] = useState([]);
    const [showAnswerStatus, setShowAnswerStatus] = useState(false);

    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    const checkAnswers = () => {
        setShowAnswerStatus(true);
    };

    const onAnswerChange = (newSelectedValues) => {
        setShowAnswerStatus(false);
        setSelectedAnswers(newSelectedValues);
    };

    useEffect(() => {
        setSelectedAnswers([]);
        setShowAnswerStatus(false);
    }, [question_data]);

    return (
        <>
            <Card>
                <CardBody>
                    <p>
                        <strong>{question}</strong>
                    </p>
                    {answers && (
                        <CheckboxGroup onValueChange={onAnswerChange}>
                            {answers.map((answer, index) => (
                                <Checkbox key={index} value={index}>
                                    {showAnswerStatus &&
                                    selectedAnswers.includes(index) ? (
                                        answer.is_correct ? (
                                            <span className="text-green-500">
                                                {answer.answer}
                                            </span>
                                        ) : (
                                            <span className="text-red-500">
                                                {answer.answer}
                                            </span>
                                        )
                                    ) : (
                                        answer.answer
                                    )}
                                </Checkbox>
                            ))}
                        </CheckboxGroup>
                    )}
                </CardBody>
            </Card>
            <Button onPress={checkAnswers}>Checar</Button>
            <Button onPress={onOpen} isDisabled={!images}>
                Imagenes
            </Button>
            <Modal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                size="3xl"
                className="dark text-foreground bg-background border border-white"
            >
                <ModalContent>
                    {(onClose) => (
                        <div className="w-full overflow-hidden">
                            <EmblaCarousel images={images} />
                        </div>
                    )}
                </ModalContent>
            </Modal>
            <Button onPress={nextQuestion}>Siguiente</Button>
        </>
    );
}

export default Question;
